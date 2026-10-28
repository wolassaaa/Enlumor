"""Builds the fixed acceptance paper. Its answers are known: the method is named only in the text,
and which method wins Figure 1 (Retrieval, not the paper's own method) is drawn only in the chart,
so a correct answer needs the page image and cannot be guessed from the text."""
import sys
import pymupdf as fitz

out = sys.argv[1]
doc = fitz.open()
W, H = fitz.paper_rect('letter').width, fitz.paper_rect('letter').height
css = "body{font-family:serif;font-size:10pt;line-height:1.35} h1{font-size:16pt;text-align:center;margin:0 0 6pt} .au{text-align:center;margin-bottom:10pt} h2{font-size:11pt;margin:9pt 0 4pt} p{text-align:justify;margin:0 0 6pt} table{border-collapse:collapse;margin:6pt auto} td,th{border:0.5pt solid #444;padding:2pt 6pt;font-size:9pt}"
filler = ("Long academic documents spread one argument over many pages, so a reader must keep earlier claims in mind "
          "while checking new evidence. We study how a reading companion can stay grounded in the exact sentences it cites. ")

def page(*columns):
    """One page; each argument is the HTML for one column."""
    p = doc.new_page(width=W, height=H)
    if len(columns) == 1:
        boxes = [fitz.Rect(64, 64, W - 64, H - 64)]
    else:
        mid = W / 2
        boxes = [fitz.Rect(56, 64, mid - 10, 450), fitz.Rect(mid + 10, 64, W - 56, 450)]
    for box, html in zip(boxes, columns):
        p.insert_htmlbox(box, html, css=css)
    return p

page("<h1>Lumen Routing: Grounded Reading Companions for Long Papers</h1><div class='au'>Enlumor Acceptance Fixture</div>"
     "<p><b>Abstract.</b> We introduce Lumen Routing, a method that first selects the passages supporting a claim and only then "
     "explains them, so every explanation can be traced back to its source sentence. " + filler + "</p>"
     "<h2>1. Introduction</h2><p>" + filler * 4 + "</p>")
# Page 2: method text in two columns, then a vector chart whose values appear nowhere in the text.
p2 = page("<h2>2. Method</h2><p>Lumen Routing has two stages. The router scores passages against the reader's question; the explainer "
          "writes an answer citing only the routed passages. " + filler * 2 + "</p>",
          "<h2>3. Experiments</h2><p>We compare three methods: Baseline, Retrieval and Lumen. As Figure 1 shows, one of them clearly leads. " + filler + "</p>")
chart = fitz.Rect(120, 470, W - 120, 690)
p2.draw_rect(chart, color=(0.6, 0.6, 0.6), width=0.5)
for i, (name, value, color) in enumerate([("Baseline", 0.35, (0.55, 0.6, 0.7)), ("Retrieval", 0.9, (0.5, 0.7, 0.55)), ("Lumen", 0.55, (0.85, 0.55, 0.3))]):
    x0 = chart.x0 + 40 + i * 110
    top = chart.y1 - 20 - value * 170
    p2.draw_rect(fitz.Rect(x0, top, x0 + 60, chart.y1 - 20), color=color, fill=color)
    p2.insert_text((x0 + 4, chart.y1 - 6), name, fontsize=9)
p2.insert_text((chart.x0, chart.y1 + 18), "Figure 1: Accuracy of the three methods on the long-document benchmark.", fontsize=9)
page("<h2>4. Results</h2><p>Table 1 lists the cost of each method.</p><table><tr><th>Method</th><th>Tokens per answer</th><th>Latency (s)</th></tr>"
     "<tr><td>Baseline</td><td>1,200</td><td>2.1</td></tr><tr><td>Retrieval</td><td>2,400</td><td>3.4</td></tr><tr><td>Lumen</td><td>1,900</td><td>2.8</td></tr></table>"
     "<p>Table 1: Cost per answer.</p><h2>5. Conclusion</h2><p>Grounding every explanation in routed passages keeps a reading companion honest. " + filler * 2 + "</p>")
page("<h2>References</h2><p>[1] A. Reader. On careful reading. 2024.</p><p>[2] B. Scholar. Evidence first. 2025.</p>")
doc.save(out)
print(len(doc))
