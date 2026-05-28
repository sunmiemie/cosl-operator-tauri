import json
import os
import random
import string
import webbrowser
import base64

import plotly
from typing import Optional
from flojoy import Boolean, Plotly, String, flojoy
import logging
import pdfkit


@flojoy
def REPORT_GENERATION2(
        title: Optional[String],
        img_url: Optional[String],
        introduction: Optional[String],
        test_success: Optional[Boolean],
        figures: Optional[list[Plotly]],
) -> None:
    """Generate a PDF report (saved to user's desktop) with embedded Plotly charts as static images.

    Parameters
    ----------
    title : String
        The title of the report
    img_url : String
        URL for the logo in the report letterhead
    introduction : String
        Report preamble
    figures : List[Plotly]
        List of Plotly charts to display as static images

    Returns
    -------
    None
    """

    # 获取当前文件路径和模板路径
    current_file_path = os.path.abspath(__file__)
    template_path = os.path.join(os.path.dirname(current_file_path), "template.html")

    DEFAULT_LOGO = "https://www.cosl.com.cn/images/1503030956382832014.jpg"

    with open(template_path, "r") as f:
        html = f.read()

        # 处理标题
        if title is not None:
            html = html.replace("{{TITLE}}", title.s)

        # 处理简介
        if introduction is not None:
            html = html.replace("{{INTRODUCTION}}", introduction.s)

        # 处理测试状态
        status_color = "green" if test_success else "red"
        status = "Pass" if test_success else "Fail"
        html = html.replace("{{STATUS}}", status)
        html = html.replace("{{STATUS_COLOR}}", status_color)

        # 处理Logo
        logo_url = img_url.s if (img_url and len(img_url.s) > 0 and " " not in img_url.s) else DEFAULT_LOGO
        html = html.replace("{{LOGO_URL}}", logo_url)

        # 处理图表（新增静态图片处理）
        # 处理图表部分修改如下
        if figures is not None:
            figures_html = ""
            for idx, figure_obj in enumerate(figures):
                # 获取Plotly Figure对象
                fig = figure_obj.fig

                # 生成Base64编码的图片
                img_bytes = plotly.io.to_image(fig, format="png")
                img_base64 = base64.b64encode(img_bytes).decode("utf-8")

                # 获取标题（兼容多版本写法）
                title = ""
                if hasattr(fig.layout, 'title') and fig.layout.title:
                    if hasattr(fig.layout.title, 'text'):
                        title = fig.layout.title.text
                    else:
                        title = str(fig.layout.title)

                # 获取注释（兼容空值情况）
                caption = ""
                if hasattr(fig.layout, 'annotations') and fig.layout.annotations:
                    first_annotation = fig.layout.annotations[0]
                    if hasattr(first_annotation, 'text'):
                        caption = first_annotation.text

                # 构建HTML内容
                figures_html += f"""
                    <div class="chart-container">
                        <h2>{title or f'Figure {idx + 1}'}</h2>
                        <img src="data:image/png;base64,{img_base64}" class="chart-image">
                        <p class="chart-caption">{caption}</p>
                    </div>
                """
            html = html.replace("{{FIGURES}}", figures_html)
        else:
            html = html.replace("{{FIGURES}}", "")

        # 移除不需要的JavaScript部分
        html = html.replace("{{SCRIPT}}", "")

    # 生成桌面文件路径
    desktop_dir = os.path.expanduser("~/Desktop")
    random_str = "".join(random.choices(string.ascii_uppercase + string.digits, k=5))

    # 先保存HTML临时文件
    html_filename = f"report_temp_{random_str}.html"
    html_path = os.path.join(desktop_dir, html_filename)
    with open(html_path, "w") as f:
        f.write(html)

    # 转换为PDF（新增PDF生成）
    pdf_filename = f"report_{random_str}.pdf"
    pdf_path = os.path.join(desktop_dir, pdf_filename)

    try:
        # Windows系统可能需要指定wkhtmltopdf路径，例如：
        # config = pdfkit.configuration(wkhtmltopdf=r'C:\Users\Admin\Desktop\wkhtmltox\bin\wkhtmltopdf.exe')
        pdfkit.from_file(
            input=html_path,
            output_path=pdf_path,
            options={
                'encoding': "UTF-8",
                'page-size': 'A4',
                'margin-top': '20mm',
                'margin-right': '10mm',
                'margin-bottom': '20mm',
                'margin-left': '10mm',
                'quiet': ''
            }
        )
    except Exception as e:
        logging.error(f"PDF Generation Failed: {str(e)}")
        raise RuntimeError("Please ensure that wkhtmltopdf is installed and configured with the correct path") from e
    finally:
        # 清理临时HTML文件
        if os.path.exists(html_path):
            os.remove(html_path)

    # 用浏览器打开PDF
    webbrowser.open_new_tab(f"file://{pdf_path}")

    return None
