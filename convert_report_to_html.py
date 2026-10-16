import re
import html

def markdown_to_html(md_text):
    # CSS styling per University guidelines
    css = """
    <style>
      @page {
        size: A4 portrait;
        margin-top: 15mm;
        margin-bottom: 22mm;
        margin-right: 20mm;
        margin-left: 30mm;
        @bottom-right {
          content: counter(page);
        }
      }
      body {
        font-family: "Times New Roman", Times, serif;
        font-size: 12pt;
        line-height: 1.5;
        color: #000;
        margin: 0;
        padding: 20mm 20mm 20mm 30mm;
        background-color: #fff;
        text-align: justify;
      }
      @media screen {
        body {
          max-width: 800px;
          margin: 20px auto;
          padding: 30px 40px;
          border: 1px solid #ccc;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
      }
      .page-break {
        page-break-before: always;
        break-before: page;
        margin-top: 40px;
        border-top: 1px dashed #aaa;
        padding-top: 20px;
      }
      @media print {
        .page-break {
          border-top: none;
          padding-top: 0;
          margin-top: 0;
        }
        body {
          padding: 0;
          max-width: none;
          box-shadow: none;
          border: none;
        }
      }
      h1 {
        font-size: 16pt;
        font-weight: bold;
        text-align: center;
        margin-top: 24pt;
        margin-bottom: 12pt;
        line-height: 1.3;
      }
      h2 {
        font-size: 14pt;
        font-weight: bold;
        margin-top: 18pt;
        margin-bottom: 8pt;
      }
      h3 {
        font-size: 14pt;
        font-weight: bold;
        margin-top: 14pt;
        margin-bottom: 6pt;
      }
      h4 {
        font-size: 12pt;
        font-weight: bold;
        margin-top: 10pt;
        margin-bottom: 4pt;
      }
      p {
        margin-top: 0;
        margin-bottom: 8pt;
        text-indent: 0;
      }
      .center {
        text-align: center;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 12pt;
        margin-bottom: 12pt;
        font-size: 11pt;
      }
      th, td {
        border: 1px solid #333;
        padding: 6pt 8pt;
        text-align: left;
        vertical-align: top;
      }
      th {
        background-color: #f2f2f2;
        font-weight: bold;
        text-align: center;
      }
      pre {
        background-color: #f8f9fa;
        border: 1px solid #ddd;
        padding: 8pt;
        font-family: "Courier New", Courier, monospace;
        font-size: 9.5pt;
        line-height: 1.25;
        overflow-x: auto;
        white-space: pre-wrap;
        margin-top: 10pt;
        margin-bottom: 10pt;
      }
      code {
        font-family: "Courier New", Courier, monospace;
        background-color: #f4f4f4;
        padding: 1px 4px;
        font-size: 10.5pt;
      }
      ul, ol {
        margin-top: 0;
        margin-bottom: 8pt;
        padding-left: 24pt;
      }
      li {
        margin-bottom: 4pt;
      }
      hr {
        border: 0;
        border-top: 1px solid #888;
        margin: 20pt 0;
      }
      .caption {
        text-align: center;
        font-style: italic;
        font-size: 11pt;
        margin-top: 4pt;
        margin-bottom: 12pt;
      }
      .image-box {
        border: 1px dashed #777;
        background: #fdfdfd;
        padding: 18pt;
        text-align: center;
        margin: 14pt auto;
        font-weight: bold;
        color: #444;
      }
    </style>
    """

    lines = md_text.split('\n')
    out = []
    in_code = False
    code_buf = []
    in_table = False
    table_buf = []

    def flush_table(tb):
        if not tb:
            return ""
        html_t = ["<table>\n"]
        header = True
        for row in tb:
            # check if separator row
            if re.match(r'^\s*\|?\s*[-:]+[-| :]*\|?\s*$', row):
                header = False
                continue
            cells = [c.strip() for c in row.strip().strip('|').split('|')]
            tag = "th" if header else "td"
            html_t.append("  <tr>\n")
            for cell in cells:
                # format inline within cell
                formatted = format_inline(cell)
                html_t.append(f"    <{tag}>{formatted}</{tag}>\n")
            html_t.append("  </tr>\n")
            if header:
                header = False
        html_t.append("</table>\n")
        return "".join(html_t)

    def format_inline(s):
        s = s.replace(r'\pagebreak', '<div class="page-break"></div>')
        # bold
        s = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', s)
        # italic
        s = re.sub(r'\*(.*?)\*', r'<em>\1</em>', s)
        # inline code
        s = re.sub(r'`(.*?)`', r'<code>\1</code>', s)
        # math notation simple clean up
        s = s.replace('$', '')
        return s

    for line in lines:
        if line.strip() == '\\pagebreak':
            if in_table:
                out.append(flush_table(table_buf))
                table_buf = []
                in_table = False
            out.append('<div class="page-break"></div>\n')
            continue

        if line.startswith('```'):
            if in_code:
                in_code = False
                escaped = html.escape('\n'.join(code_buf))
                out.append(f"<pre><code>{escaped}</code></pre>\n")
                code_buf = []
            else:
                if in_table:
                    out.append(flush_table(table_buf))
                    table_buf = []
                    in_table = False
                in_code = True
                code_buf = []
            continue

        if in_code:
            code_buf.append(line)
            continue

        # Check table line
        if '|' in line and re.match(r'^\s*\|.*\|\s*$', line):
            in_table = True
            table_buf.append(line)
            continue
        else:
            if in_table:
                out.append(flush_table(table_buf))
                table_buf = []
                in_table = False

        stripped = line.strip()

        # Headings
        if stripped.startswith('# '):
            h_text = format_inline(stripped[2:])
            out.append(f"<h1>{h_text}</h1>\n")
        elif stripped.startswith('## '):
            h_text = format_inline(stripped[3:])
            out.append(f"<h2>{h_text}</h2>\n")
        elif stripped.startswith('### '):
            h_text = format_inline(stripped[4:])
            out.append(f"<h3>{h_text}</h3>\n")
        elif stripped.startswith('#### '):
            h_text = format_inline(stripped[5:])
            out.append(f"<h4>{h_text}</h4>\n")
        elif stripped.startswith('---'):
            out.append("<hr/>\n")
        elif stripped.startswith('* ') or stripped.startswith('- '):
            item_text = format_inline(stripped[2:])
            out.append(f"<ul><li>{item_text}</li></ul>\n")
        elif re.match(r'^\d+\.\s', stripped):
            item_text = format_inline(re.sub(r'^\d+\.\s*', '', stripped))
            out.append(f"<ol><li>{item_text}</li></ol>\n")
        elif stripped.startswith('*Fig') or stripped.startswith('*Table'):
            cap = format_inline(stripped.strip('*'))
            out.append(f"<p class='caption'>{cap}</p>\n")
        elif stripped.startswith('[Image:'):
            img_text = format_inline(stripped)
            out.append(f"<div class='image-box'>{img_text}</div>\n")
        elif stripped == '':
            pass
        else:
            p_text = format_inline(stripped)
            out.append(f"<p>{p_text}</p>\n")

    if in_table:
        out.append(flush_table(table_buf))

    # Clean up contiguous ul/ol tags
    body = "".join(out)
    body = re.sub(r'</ul>\s*<ul>', '', body)
    body = re.sub(r'</ol>\s*<ol>', '', body)

    full_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Kavach — IoE-Based Smart Helmet Project Report</title>
  {css}
</head>
<body>
{body}
</body>
</html>
"""
    return full_html

if __name__ == '__main__':
    with open('d:/Smart Helmet IOE/PROJECT_REPORT.md', 'r', encoding='utf-8') as f:
        md_content = f.read()
    html_output = markdown_to_html(md_content)
    with open('d:/Smart Helmet IOE/PROJECT_REPORT.html', 'w', encoding='utf-8') as f:
        f.write(html_output)
    print("Successfully generated PROJECT_REPORT.html")
