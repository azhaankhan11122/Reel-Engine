import os
import math
try:
    from PIL import Image, ImageDraw
except ImportError:
    import subprocess
    subprocess.run(["pip", "install", "Pillow"])
    from PIL import Image, ImageDraw

output_dir = "ui/static/ezgif-15e359c27ada0a0c-jpg"
os.makedirs(output_dir, exist_ok=True)

width = 1920
height = 1080

for i in range(100):
    img = Image.new('RGB', (width, height), color=(15, 17, 21))
    draw = ImageDraw.Draw(img)
    
    # Calculate circle position based on frame (0 to 99)
    progress = i / 99.0
    
    # Simple sine wave motion
    cx = width / 2 + math.sin(progress * math.pi * 2) * 400
    cy = height / 2 + math.cos(progress * math.pi * 2) * 200
    r = 200 + math.sin(progress * math.pi) * 100
    
    # Draw a premium glowing effect (nested circles)
    for j in range(20, 0, -1):
        alpha = int(255 * (1 - j/20))
        color = (int(0 * alpha/255), int(212 * alpha/255), int(255 * alpha/255))
        draw.ellipse([cx - r - j*5, cy - r - j*5, cx + r + j*5, cy + r + j*5], outline=color, width=2)
        
    img.save(f"{output_dir}/frame-{i:03d}.jpg", quality=85)

print("Done generating 100 frames.")
