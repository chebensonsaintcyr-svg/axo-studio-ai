#!/usr/bin/env python3
"""Build a fresh AXO vertical promo Reel with a newly generated, normalized narration."""
import base64
import json
import math
import os
import subprocess
import tempfile
import urllib.request
import wave
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT_VIDEO = ROOT / "assets" / "axo-reel-v3.mp4"
OUT_COVER = ROOT / "assets" / "axo-reel-v3-cover.jpg"
JOB_FILE = ROOT / "assets" / "axo-reel-rebuild.json"
WORKER_URL = "https://axo-studio-ai-api.chebensonsaintcyr.workers.dev/"
ALLOWED_ORIGIN = "https://chebensonsaintcyr-svg.github.io"
W, H, FPS = 720, 1280, 24
GOLD = (215, 180, 90)
WHITE = (248, 248, 246)
MUTED = (174, 174, 170)
BG = (7, 7, 7)

def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

def font(size, bold=False):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()

def centered(draw, text, y, ft, fill, max_width=None):
    if max_width:
        words, lines, current = text.split(), [], ""
        for word in words:
            candidate = (current + " " + word).strip()
            if draw.textlength(candidate, font=ft) <= max_width:
                current = candidate
            else:
                if current:
                    lines.append(current)
                current = word
        if current:
            lines.append(current)
        line_height = ft.size + 10
        for line in lines:
            draw.text(((W - draw.textlength(line, font=ft)) / 2, y), line, font=ft, fill=fill)
            y += line_height
        return y
    draw.text(((W - draw.textlength(text, font=ft)) / 2, y), text, font=ft, fill=fill)
    return y + ft.size + 8

def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)

def make_background():
    im = Image.new("RGB", (W, H), BG)
    pix = im.load()
    for y in range(H):
        for x in range(W):
            # very restrained warm light source behind the card
            dx, dy = (x - W * 0.73) / 520, (y - H * 0.37) / 680
            glow = max(0.0, 1.0 - math.sqrt(dx * dx + dy * dy)) * 11
            top_shade = int(3 * (1 - y / H))
            pix[x, y] = (7 + int(glow * 0.82), 7 + int(glow * 0.70), 7 + top_shade)
    d = ImageDraw.Draw(im)
    grid = (19, 19, 17)
    for x in range(0, W, 72):
        d.line((x, 0, x, H), fill=grid, width=1)
    for y in range(0, H, 72):
        d.line((0, y, W, y), fill=grid, width=1)
    # subtle cropped arc, only background decoration
    d.arc((-215, 185, 460, 860), 300, 75, fill=(36, 32, 22), width=2)
    d.arc((410, 65, 920, 570), 95, 240, fill=(28, 26, 21), width=2)
    return im

def coffee_icon(draw, cx=360, cy=560):
    # Decorative steaming cup illustration; no extra corner logo.
    for ox in (-32, 0, 32):
        points = [(cx + ox - 8, cy - 50), (cx + ox - 11, cy - 63),
                  (cx + ox, cy - 78), (cx + ox + 8, cy - 62)]
        draw.line(points, fill=GOLD, width=3, joint="curve")
    rounded(draw, (cx - 54, cy - 22, cx + 48, cy + 78), 15, GOLD, outline=(243, 217, 154), width=2)
    draw.line((cx - 36, cy + 17, cx + 28, cy + 17), fill=(65, 49, 18), width=4)
    draw.arc((cx + 39, cy - 3, cx + 86, cy + 54), 265, 95, fill=GOLD, width=9)
    for x1, y1, x2, y2 in [(cx-82,cy+8,cx-63,cy+8),(cx+66,cy+8,cx+86,cy+8),
                            (cx,cy+97,cx,cy+116),(cx-69,cy-34,cx-56,cy-21),
                            (cx+61,cy-34,cx+49,cy-21)]:
        draw.line((x1,y1,x2,y2), fill=GOLD, width=2)

def base_layout(bg, job, scene):
    im = bg.copy()
    d = ImageDraw.Draw(im)
    # Small, unobtrusive category badge and line; no prominent logo in upper-left.
    rounded(d, (500, 85, 676, 126), 20, (24, 24, 22), outline=(70, 65, 50), width=1)
    d.text((518, 98), "CRIATIVIDADE + IA", font=font(12, True), fill=WHITE)
    d.line((44, 166, 676, 166), fill=(43, 42, 37), width=5)

    if scene == 0:
        centered(d, "OLHA COMO FICA", 232, font(42, True), WHITE, max_width=640)
        centered(d, "Exemplo visual fictício", 290, font(22), MUTED)
        rounded(d, (95, 350, 625, 1035), 35, (13, 13, 13), outline=GOLD, width=2)
        rounded(d, (114, 372, 606, 690), 26, (29, 24, 15), outline=(92, 77, 43), width=1)
        coffee_icon(d, 360, 520)
        rounded(d, (122, 720, 356, 762), 20, (39, 33, 20), outline=(106, 88, 48), width=1)
        d.text((139, 733), "CAFÉ AURORA · DEMO", font=font(12, True), fill=GOLD)
        d.text((122, 796), "O sabor que", font=font(31, True), fill=WHITE)
        d.text((122, 841), "desperta sua manhã.", font=font(29, True), fill=GOLD)
        d.text((122, 900), "Ideia + roteiro + texto promocional", font=font(15), fill=MUTED)
        rounded(d, (122, 949, 598, 1005), 25, (25, 25, 25), outline=(75, 75, 75), width=1)
        centered(d, "UM EXEMPLO. MIL POSSIBILIDADES.", 968, font(12, True), WHITE)
    elif scene == 1:
        centered(d, "UMA IDEIA.", 248, font(38, True), WHITE)
        centered(d, "UMA CAMPANHA.", 298, font(38, True), GOLD)
        rounded(d, (86, 390, 634, 900), 32, (13, 13, 13), outline=GOLD, width=2)
        rounded(d, (110, 414, 610, 700), 22, (29, 24, 15), outline=(92, 77, 43), width=1)
        coffee_icon(d, 360, 560)
        rounded(d, (126, 733, 358, 775), 20, (39, 33, 20), outline=(106, 88, 48), width=1)
        d.text((143, 746), "CAFÉ AURORA · DEMO", font=font(12, True), fill=GOLD)
        centered(d, "O sabor que desperta", 802, font(23, True), WHITE, max_width=470)
        centered(d, "sua manhã.", 839, font(23, True), GOLD)
        centered(d, "ROTEIRO  •  LEGENDA  •  VÍDEO", 967, font(17, True), MUTED)
    else:
        centered(d, "CRIE SUA CAMPANHA", 266, font(37, True), WHITE, max_width=640)
        centered(d, "com inteligência artificial", 322, font(21), MUTED)
        rounded(d, (76, 420, 644, 780), 35, (13, 13, 13), outline=GOLD, width=2)
        centered(d, "SUA IDEIA", 482, font(29, True), WHITE)
        centered(d, "+", 535, font(32, True), GOLD)
        centered(d, "SEU NEGÓCIO", 588, font(29, True), WHITE)
        centered(d, "ROTEIRO · LEGENDA · VÍDEO", 674, font(16, True), MUTED)
        rounded(d, (92, 850, 628, 924), 31, (39, 33, 20), outline=GOLD, width=2)
        centered(d, "TESTE O AXO AGORA", 874, font(21, True), WHITE)
        centered(d, "LINK NA BIO", 955, font(20, True), GOLD)
    d.line((44, 1153, 676, 1153), fill=(57, 50, 32), width=1)
    d.text((44, 1175), "AXO STUDIO AI", font=font(13, True), fill=GOLD)
    footer = "IDEIAS EM AÇÃO"
    d.text((676 - d.textlength(footer, font=font(12)), 1177), footer, font=font(12), fill=MUTED)
    return im.convert("RGB")

def add_progress(frame, p):
    im = frame.copy()
    d = ImageDraw.Draw(im)
    rounded(d, (44, 162, 676, 170), 4, (43, 42, 37))
    if p > 0:
        rounded(d, (44, 162, 44 + max(3, int(632 * min(1, p))), 170), 4, GOLD)
    return im

def blend_scene(frames, t, duration):
    # Two short crossfades avoid abrupt visual cuts while keeping the render lightweight.
    first = duration / 3
    second = 2 * duration / 3
    fade = 0.42
    if t < first - fade / 2:
        return frames[0]
    if t < first + fade / 2:
        a = (t - (first - fade / 2)) / fade
        return Image.blend(frames[0], frames[1], max(0, min(1, a)))
    if t < second - fade / 2:
        return frames[1]
    if t < second + fade / 2:
        a = (t - (second - fade / 2)) / fade
        return Image.blend(frames[1], frames[2], max(0, min(1, a)))
    return frames[2]

def get_voice(job, temp):
    payload = json.dumps({
        "action": "speech",
        "text": job["narration"],
        "voice": job.get("voice", "Kore"),
        "style": job["style"],
    }).encode("utf-8")
    request = urllib.request.Request(
        WORKER_URL, data=payload,
        headers={"Origin": ALLOWED_ORIGIN, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            data = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise RuntimeError("Não foi possível gerar uma nova narração pelo serviço de voz. Verifique o Worker e tente novamente.") from exc
    if not data.get("audioBase64"):
        raise RuntimeError(data.get("error", "O serviço de voz não retornou áudio."))
    audio = base64.b64decode(data["audioBase64"])
    source = temp / "voice-source.bin"
    source.write_bytes(audio)
    if audio[:4] == b"RIFF" or audio[:4] in (b"fLaC", b"OggS") or audio[:3] == b"ID3":
        input_audio = source
    else:
        # Gemini speech output can be headerless 24 kHz mono signed 16-bit PCM.
        input_audio = temp / "voice-source.wav"
        with wave.open(str(input_audio), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(24000)
            wav.writeframes(audio)
    clean = temp / "voice-clean.wav"
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(input_audio), "-vn",
        "-af", "highpass=f=75,lowpass=f=14000,loudnorm=I=-16:TP=-1.5:LRA=9,aresample=48000:async=1:first_pts=0",
        "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", str(clean)
    ])
    duration_text = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(clean)
    ], text=True).strip()
    voice_duration = float(duration_text)
    if not 3.0 <= voice_duration <= 32.0:
        raise RuntimeError("A narração veio com duração inesperada; não vou publicar um vídeo com áudio possivelmente incompleto.")
    return clean, voice_duration

def main():
    job = json.loads(JOB_FILE.read_text(encoding="utf-8"))
    OUT_VIDEO.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="axo-reel-") as tmpdir:
        temp = Path(tmpdir)
        voice, voice_duration = get_voice(job, temp)
        duration = max(15.0, voice_duration + 0.85)
        frame_count = math.ceil(duration * FPS)
        bg = make_background()
        scenes = [base_layout(bg, job, i) for i in range(3)]
        cover = add_progress(scenes[1], 0.5)
        cover.save(OUT_COVER, "JPEG", quality=92, optimize=True)

        ffmpeg = [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
            "-framerate", str(FPS), "-i", "pipe:0",
            "-i", str(voice),
            "-map", "0:v:0", "-map", "1:a:0",
            "-c:v", "libx264", "-preset", "fast", "-crf", "20",
            "-pix_fmt", "yuv420p", "-r", str(FPS), "-g", str(FPS * 2),
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
            "-af", "apad=pad_dur=1.0",
            "-t", f"{duration:.3f}", "-movflags", "+faststart",
            str(OUT_VIDEO)
        ]
        proc = subprocess.Popen(ffmpeg, stdin=subprocess.PIPE)
        try:
            for n in range(frame_count):
                t = n / FPS
                frame = blend_scene(scenes, t, duration)
                frame = add_progress(frame, t / duration)
                proc.stdin.write(frame.tobytes())
            proc.stdin.close()
            code = proc.wait()
            if code != 0:
                raise RuntimeError(f"FFmpeg encerrou com erro {code}.")
        except Exception:
            if proc.poll() is None:
                proc.kill()
            raise

        # Validate both streams before marking the file ready.
        streams = json.loads(subprocess.check_output([
            "ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(OUT_VIDEO)
        ], text=True))
        video = next((s for s in streams["streams"] if s.get("codec_type") == "video"), None)
        audio = next((s for s in streams["streams"] if s.get("codec_type") == "audio"), None)
        assert video and video.get("codec_name") == "h264" and video.get("pix_fmt") == "yuv420p"
        assert audio and audio.get("codec_name") == "aac" and audio.get("sample_rate") == "48000"
        assert abs(float(streams["format"]["duration"]) - duration) < 0.5
        print(f"Generated {OUT_VIDEO.name}: {duration:.2f}s, H.264/AAC, {FPS} fps; fresh narration {voice_duration:.2f}s.")
        print(f"Video size: {OUT_VIDEO.stat().st_size} bytes; cover: {OUT_COVER.stat().st_size} bytes")

if __name__ == "__main__":
    main()
