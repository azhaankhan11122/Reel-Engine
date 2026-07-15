import os
import cv2
import numpy as np
import argparse
from pathlib import Path
from multiprocessing import Pool

def enhance_image(image_path, output_path, scale_factor=2.0):
    # Read the image
    img = cv2.imread(image_path)
    if img is None:
        print(f"Error reading {image_path}")
        return False

    # 1. Upscale using Lanczos4 (excellent for preserving details during upscaling)
    h, w = img.shape[:2]
    new_h, new_w = int(h * scale_factor), int(w * scale_factor)
    upscaled = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)

    # 2. Denoise slightly to remove artifacts before sharpening
    denoised = cv2.fastNlMeansDenoisingColored(upscaled, None, h=3, hColor=3, templateWindowSize=7, searchWindowSize=21)

    # 3. Enhance Contrast using CLAHE (Contrast Limited Adaptive Histogram Equalization)
    lab = cv2.cvtColor(denoised, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    cl = clahe.apply(l)
    limg = cv2.merge((cl, a, b))
    contrast_enhanced = cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)

    # 4. Sharpening (Unsharp Masking)
    gaussian = cv2.GaussianBlur(contrast_enhanced, (0, 0), 2.0)
    sharpened = cv2.addWeighted(contrast_enhanced, 1.5, gaussian, -0.5, 0)

    # Save the output with high quality
    cv2.imwrite(output_path, sharpened, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
    return True

def process_file(args):
    in_path, out_path, scale_factor = args
    success = enhance_image(in_path, out_path, scale_factor)
    return success

def main():
    parser = argparse.ArgumentParser(description="Batch upscale and enhance image frames for motion graphics.")
    parser.add_argument("--input", type=str, required=True, help="Input directory containing frames")
    parser.add_argument("--output", type=str, required=True, help="Output directory for enhanced frames")
    parser.add_argument("--scale", type=float, default=2.0, help="Scale factor for upscaling")
    parser.add_argument("--workers", type=int, default=os.cpu_count(), help="Number of worker processes")

    args = parser.parse_args()

    input_dir = Path(args.input)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Collect image files
    files = []
    for ext in ["*.jpg", "*.jpeg", "*.png"]:
        files.extend(input_dir.glob(ext))

    tasks = []
    for f in files:
        out_f = output_dir / f.name
        tasks.append((str(f), str(out_f), args.scale))

    print(f"Found {len(tasks)} images in {input_dir}. Enhancing...")

    if len(tasks) == 0:
        print("No images found. Exiting.")
        return

    # Run in parallel to speed up batch processing
    with Pool(args.workers) as p:
        results = p.map(process_file, tasks)

    success_count = sum(1 for r in results if r)
    print(f"Successfully enhanced {success_count} / {len(tasks)} images. Saved to {output_dir}")

if __name__ == "__main__":
    main()
