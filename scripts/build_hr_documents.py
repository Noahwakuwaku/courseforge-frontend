"""Build the HR PDFs from the repository's Markdown and unmodified screenshots."""
import argparse
import html
import json
import re
from pathlib import Path

from PIL import Image as PILImage
from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'docs' / 'assets' / 'hr'
OUT = ROOT / 'output' / 'pdf'
FONT = 'CourseForgeSans'
BOLD = 'CourseForgeSansBold'
INK = colors.HexColor('#303742')
MUTED = colors.HexColor('#697380')
LINE = colors.HexColor('#D9D9D9')


def setup_fonts():
    pdfmetrics.registerFont(TTFont(FONT, 'C:/Windows/Fonts/msyh.ttc', subfontIndex=0))
    pdfmetrics.registerFont(TTFont(BOLD, 'C:/Windows/Fonts/msyhbd.ttc', subfontIndex=0))
    pdfmetrics.registerFontFamily(FONT, normal=FONT, bold=BOLD, italic=FONT, boldItalic=BOLD)


def styles():
    body = ParagraphStyle('Body', fontName=FONT, fontSize=10.5, leading=16,
                          textColor=INK, wordWrap='CJK', spaceAfter=6)
    return {
        'body': body,
        'title': ParagraphStyle('Title', parent=body, fontName=BOLD, fontSize=24,
                                leading=31, textColor=colors.black, spaceAfter=14),
        'h1': ParagraphStyle('Heading', parent=body, fontName=BOLD, fontSize=13,
                             leading=19, textColor=colors.black, spaceBefore=10,
                             spaceAfter=5, keepWithNext=True),
        'bullet': ParagraphStyle('Bullet', parent=body, leftIndent=11, firstLineIndent=0,
                                 bulletIndent=0, bulletFontName=FONT, bulletFontSize=8,
                                 spaceAfter=5),
        'small': ParagraphStyle('Small', parent=body, fontSize=9, leading=13,
                                textColor=MUTED, spaceAfter=5),
        'cell': ParagraphStyle('Cell', parent=body, fontSize=9.3, leading=14,
                               spaceAfter=0),
        'th': ParagraphStyle('TableHead', parent=body, fontName=BOLD, fontSize=9.5,
                             leading=14, textColor=colors.white, spaceAfter=0),
    }


def inline(text):
    # Relative Markdown links remain readable without linking to local source files.
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    text = text.replace('`', '')
    return html.escape(text)


def md_story(text, st, matrix_page_break=False):
    story, lines, i = [], text.splitlines(), 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if line.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].lstrip().startswith('|'):
                cells = [x.strip() for x in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-+:?', x) for x in cells):
                    rows.append(cells)
                i += 1
            widths = [60, 285, 162.27] if len(rows[0]) == 3 else [73, 79, 149, 206.27]
            table_rows = [[Paragraph(inline(c), st['th' if ri == 0 else 'cell'])
                           for c in row] for ri, row in enumerate(rows)]
            table = Table(table_rows, colWidths=widths, repeatRows=1, hAlign='LEFT')
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#343D49')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F5F6F8')]),
                ('GRID', (0, 0), (-1, -1), .45, LINE),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                ('TOPPADDING', (0, 0), (-1, -1), 7),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
            ]))
            story.extend([table, Spacer(1, 9)])
            continue
        if line.startswith('# '):
            story.append(Paragraph(inline(line[2:]), st['title']))
        elif line.startswith('## '):
            title = line[3:]
            if matrix_page_break and title == '需求与验收对照':
                story.append(PageBreak())
            story.append(Paragraph(inline(title), st['h1']))
        elif line.startswith('- '):
            story.append(Paragraph(inline(line[2:]), st['bullet'], bulletText='•'))
        elif line.startswith('版本 '):
            story.append(Paragraph(inline(line), st['small']))
        else:
            story.append(Paragraph(inline(line), st['body']))
        i += 1
    return story


def page_footer(pdf, doc):
    pdf.saveState()
    pdf.setFont(FONT, 8)
    pdf.setFillColor(MUTED)
    pdf.drawString(44, 25, 'CourseForge')
    pdf.drawRightString(A4[0] - 44, 25, str(doc.page))
    pdf.restoreState()


def create_text_pdf(path, text, st, title, matrix_page_break=False):
    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=44, rightMargin=44,
                            topMargin=35, bottomMargin=40, title=title,
                            author='CourseForge', pageCompression=1)
    doc.build(md_story(text, st, matrix_page_break), onFirstPage=page_footer, onLaterPages=page_footer)


def create_gallery(path, figures, st, first_page):
    width, height = landscape(A4)
    pdf = canvas.Canvas(str(path), pagesize=(width, height), pageCompression=1)
    pdf.setTitle('CourseForge 界面示例')
    pdf.setAuthor('CourseForge')
    for index, fig in enumerate(figures):
        pdf.setFillColor(colors.black)
        pdf.setFont(BOLD, 19)
        pdf.drawString(34, height - 35, fig['title'])
        pdf.setFont(FONT, 9)
        pdf.drawRightString(width - 34, height - 32, f"对应需求 {fig['req']}")
        caption = Paragraph(inline(fig['caption']), st['body'])
        _, caption_height = caption.wrap(width - 68, 60)
        caption.drawOn(pdf, 34, height - 47 - caption_height)

        image_path = ASSETS / fig['file']
        with PILImage.open(image_path) as im:
            image_width, image_height = im.size
        image_top = height - 55 - caption_height
        image_bottom = 50 if fig['note'] else 39
        scale = min((width - 68) / image_width, (image_top - image_bottom) / image_height)
        draw_width, draw_height = image_width * scale, image_height * scale
        x, y = (width - draw_width) / 2, image_top - draw_height
        pdf.drawImage(str(image_path), x, y, width=draw_width, height=draw_height, mask='auto')
        pdf.setStrokeColor(LINE)
        pdf.setLineWidth(.5)
        pdf.rect(x, y, draw_width, draw_height, stroke=1, fill=0)
        if fig['note']:
            note = Paragraph(inline(fig['note']), st['small'])
            _, note_height = note.wrap(width - 115, 35)
            note.drawOn(pdf, 34, 24)
        pdf.setFont(FONT, 8)
        pdf.setFillColor(MUTED)
        pdf.drawRightString(width - 34, 24, str(first_page + index))
        pdf.showPage()
    pdf.save()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--qa-dir', required=True, type=Path)
    args = parser.parse_args()
    args.qa_dir.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    setup_fonts()
    st = styles()
    design_text = (ROOT / 'docs' / 'PRODUCT_DESIGN.zh-CN.md').read_text(encoding='utf-8').split('## 界面示例')[0]
    design_text += '\n界面示例见后续 6 页，按创建、生成、审核和交付的操作顺序排列。\n'
    figures = json.loads((ASSETS / 'screenshots.json').read_text(encoding='utf-8'))
    intro = args.qa_dir / 'design-intro.pdf'
    gallery = args.qa_dir / 'design-gallery.pdf'
    create_text_pdf(intro, design_text, st, 'CourseForge 产品设计与界面展示')
    intro_pages = len(PdfReader(intro).pages)
    create_gallery(gallery, figures, st, intro_pages + 1)
    writer = PdfWriter()
    writer.append(str(intro), import_outline=False)
    writer.append(str(gallery), import_outline=False)
    writer.add_metadata({'/Title': 'CourseForge 产品设计与界面展示', '/Author': 'CourseForge'})
    writer.add_outline_item('产品设计', 0)
    for i, fig in enumerate(figures):
        writer.add_outline_item(fig['title'], intro_pages + i)
    design_out = OUT / 'CourseForge_产品设计与界面展示.pdf'
    writer.write(design_out)

    prd_text = (ROOT / 'docs' / 'PRD.zh-CN.md').read_text(encoding='utf-8')
    prd_out = OUT / 'CourseForge_PRD需求与验收.pdf'
    create_text_pdf(prd_out, prd_text, st, 'CourseForge 产品需求与验收', matrix_page_break=True)
    for file in [design_out, prd_out]:
        reader = PdfReader(file)
        print(json.dumps({'file': str(file), 'pages': len(reader.pages), 'bytes': file.stat().st_size,
                          'page_text_lengths': [len(p.extract_text() or '') for p in reader.pages]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
