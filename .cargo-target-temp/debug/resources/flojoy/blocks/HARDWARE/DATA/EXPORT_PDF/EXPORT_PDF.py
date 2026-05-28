from flojoy import flojoy, Directory, Plotly
import plotly.graph_objects as go
from io import BytesIO
import os
import logging
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib.utils import ImageReader
from reportlab.lib.colors import green, black
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas


@flojoy
def EXPORT_PDF(
        default: Plotly,
        dir: Directory,
        filename: str = "exported.pdf",
) -> None:
    fig = default.fig
    img_buffer = BytesIO()
    fig.write_image(img_buffer, format="png", scale=2)
    pdf_path = os.path.join(dir.unwrap(), filename)
    c = canvas.Canvas(pdf_path, pagesize=A4)
    width, height = A4

    font_path = "/home/liuzhipeng/Downloads/NotoSansCJKsc.ttf"
    pdfmetrics.registerFont(TTFont("NotoSansCJKsc", font_path))
    logging.info(f"字体:{pdfmetrics.getRegisteredFontNames()}")
    logging.info(f"height:{height}")
    c.setFont("NotoSansCJKsc", 24)  # 字体和大小
    c.drawString(20 * mm, 100 * mm, "HSVP旋转变压器测试报告")  # 位置坐标

    c.drawString(20 * mm, 100 * mm, "Status:")
    c.drawString(60 * mm, 100 * mm, "Pass")
    c.setFillColor(green)
    c.setStrokeColor(black)
    c.circle(55 * mm, -220 * mm, 3 * mm, fill=1)

    img_buffer.seek(0)
    img_reader = ImageReader(img_buffer)
    c.drawImage(img_reader, x=2 * cm, y=4 * cm, width=15 * cm, preserveAspectRatio=True)

    c.save()
    return None
