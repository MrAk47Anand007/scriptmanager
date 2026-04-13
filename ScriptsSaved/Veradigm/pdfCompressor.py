import base64
import os
import tempfile
from pdf2image import convert_from_path
from PIL import Image
import pikepdf

MAX_SIZE = 1200 * 1024  # 1.2MB
TEMP_FILES = []


def validate_file(file_path):
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    if not file_path.lower().endswith(".pdf"):
        raise ValueError("Not a PDF file")


def is_image_pdf(file_path):
    with pikepdf.open(file_path) as pdf:
        image_count = 0
        page_count = len(pdf.pages)
        for page in pdf.pages:
            try:
                if len(page.images) > 0:
                    image_count += 1
            except:
                continue
    return image_count >= (page_count / 2)


def compress_image_pdf(file_path):
    dpi_levels = [220, 200, 180]
    quality_levels = [65, 60, 55]
    TARGET_SIZE = 1300 * 1024
    last_output = None

    for dpi in dpi_levels:
        for quality in quality_levels:
            images = convert_from_path(file_path, dpi=dpi)
            temp_pdf = tempfile.mktemp(suffix=".pdf")
            TEMP_FILES.append(temp_pdf)

            processed = []
            for img in images:
                img = img.convert("RGB")
                img.thumbnail((1400, 1400))
                processed.append(img)

            processed[0].save(
                temp_pdf,
                save_all=True,
                append_images=processed[1:],
                quality=quality,
                subsampling=0
            )

            size = os.path.getsize(temp_pdf)
            last_output = temp_pdf

            if size <= TARGET_SIZE:
                return temp_pdf

    return last_output


def compress_text_pdf(file_path):
    temp_pdf = tempfile.mktemp(suffix=".pdf")
    TEMP_FILES.append(temp_pdf)

    with pikepdf.open(file_path) as pdf:
        pdf.save(
            temp_pdf,
            compress_streams=True,
            object_stream_mode=pikepdf.ObjectStreamMode.generate,
            linearize=True
        )

    return temp_pdf


def compress_pdf(file_path):
    if is_image_pdf(file_path):
        return compress_image_pdf(file_path)
    else:
        return compress_text_pdf(file_path)


def cleanup_temp_files():
    for f in TEMP_FILES:
        try:
            if os.path.exists(f):
                os.remove(f)
        except:
            pass
    TEMP_FILES.clear()


def compress_pdf_to_file(input_path, output_path):
    """
    Takes a PDF input path, compresses it, writes result to output_path.
    Returns output_path.
    """
    validate_file(input_path)

    original_size = os.path.getsize(input_path)
    print(f"Original size: {original_size / 1024:.1f} KB")

    if original_size > MAX_SIZE:
        compressed_path = compress_pdf(input_path)
    else:
        compressed_path = input_path

    final_size = os.path.getsize(compressed_path)
    print(f"Compressed size: {final_size / 1024:.1f} KB")

    # Copy result to output path
    with open(compressed_path, "rb") as f_in:
        with open(output_path, "wb") as f_out:
            f_out.write(f_in.read())

    cleanup_temp_files()
    print(f"Saved to: {output_path}")
    return output_path


def read_and_convert_to_base64(file_path):
    """
    Takes a PDF, compresses if needed, returns base64 string.
    """
    validate_file(file_path)

    original_size = os.path.getsize(file_path)
    print(f"Original size: {original_size / 1024:.1f} KB")

    if original_size > MAX_SIZE:
        file_path = compress_pdf(file_path)

    final_size = os.path.getsize(file_path)
    print(f"Final size: {final_size / 1024:.1f} KB")

    with open(file_path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("utf-8")

    cleanup_temp_files()
    return encoded


# ── Entry point ──────────────────────────────
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 3:
        print("Usage:")
        print("  python compress.py input.pdf output.pdf        → compress to file")
        print("  python compress.py input.pdf --base64          → print base64")
        sys.exit(1)

    input_file = sys.argv[1]
    mode = sys.argv[2]

    if mode == "--base64":
        result = read_and_convert_to_base64(input_file)
        print(result)
    else:
        compress_pdf_to_file(input_file, output_path=mode)