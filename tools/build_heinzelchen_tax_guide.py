#!/usr/bin/env python3
"""Build the branded Heinzelchen tax and insurance guide."""

from __future__ import annotations

import argparse
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Flowable,
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


BG = HexColor("#E4DCCB")
CARD = HexColor("#EEE8DA")
PALE = HexColor("#F7F1E8")
RED = HexColor("#A63D52")
BLUE = HexColor("#5578A8")
BLUE_DARK = HexColor("#466997")
DARK = HexColor("#2C3E50")
BORDER = HexColor("#B8C7D8")
WHITE = HexColor("#FFFFFF")

PAGE_W, PAGE_H = A4
MARGIN_X = 18 * mm
CONTENT_W = PAGE_W - 2 * MARGIN_X


class NumberBadge(Flowable):
    def __init__(self, number: int, size: float = 17):
        super().__init__()
        self.number = str(number)
        self.width = size
        self.height = size
        self.size = size

    def draw(self):
        radius = self.size / 2
        self.canv.setFillColor(BLUE)
        self.canv.circle(radius, radius, radius, stroke=0, fill=1)
        self.canv.setFillColor(WHITE)
        self.canv.setFont("Fraunces", 8.5)
        self.canv.drawCentredString(radius, radius - 3, self.number)


class CheckSquare(Flowable):
    def __init__(self, size: float = 10):
        super().__init__()
        self.width = size
        self.height = size
        self.size = size

    def draw(self):
        self.canv.setStrokeColor(BLUE)
        self.canv.setLineWidth(1.2)
        self.canv.roundRect(0, 0, self.size, self.size, 2, stroke=1, fill=0)


def register_fonts(repo_root: Path) -> None:
    font_dir = repo_root / "assets" / "fonts"
    pdfmetrics.registerFont(TTFont("Fraunces", str(font_dir / "fraunces-variable.ttf")))
    pdfmetrics.registerFont(TTFont("FrauncesItalic", str(font_dir / "fraunces-variable-italic.ttf")))
    pdfmetrics.registerFont(TTFont("Lora", str(font_dir / "lora-variable.ttf")))
    pdfmetrics.registerFont(TTFont("LoraItalic", str(font_dir / "lora-variable-italic.ttf")))
    pdfmetrics.registerFontFamily(
        "Lora",
        normal="Lora",
        bold="Fraunces",
        italic="LoraItalic",
        boldItalic="FrauncesItalic",
    )
    pdfmetrics.registerFontFamily(
        "Fraunces",
        normal="Fraunces",
        bold="Fraunces",
        italic="FrauncesItalic",
        boldItalic="FrauncesItalic",
    )


def build_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "cover_eyebrow": ParagraphStyle(
            "CoverEyebrow",
            parent=base["Normal"],
            fontName="Fraunces",
            fontSize=9.5,
            leading=12,
            textColor=BLUE,
            alignment=TA_CENTER,
            spaceAfter=7,
        ),
        "cover_title": ParagraphStyle(
            "CoverTitle",
            parent=base["Title"],
            fontName="Fraunces",
            fontSize=34,
            leading=34,
            textColor=RED,
            alignment=TA_CENTER,
            spaceAfter=10,
        ),
        "cover_subtitle": ParagraphStyle(
            "CoverSubtitle",
            parent=base["Normal"],
            fontName="Fraunces",
            fontSize=14,
            leading=18,
            textColor=BLUE_DARK,
            alignment=TA_CENTER,
            spaceAfter=5,
        ),
        "cover_meta": ParagraphStyle(
            "CoverMeta",
            parent=base["Normal"],
            fontName="Lora",
            fontSize=9.2,
            leading=13,
            textColor=BLUE,
            alignment=TA_CENTER,
            spaceAfter=12,
        ),
        "h1": ParagraphStyle(
            "H1",
            parent=base["Heading1"],
            fontName="Fraunces",
            fontSize=23,
            leading=24,
            textColor=RED,
            spaceBefore=4,
            spaceAfter=9,
        ),
        "h2": ParagraphStyle(
            "H2",
            parent=base["Heading2"],
            fontName="Fraunces",
            fontSize=14.5,
            leading=17,
            textColor=RED,
            spaceBefore=8,
            spaceAfter=6,
        ),
        "h3": ParagraphStyle(
            "H3",
            parent=base["Heading3"],
            fontName="Fraunces",
            fontSize=11.3,
            leading=14,
            textColor=BLUE_DARK,
            spaceBefore=4,
            spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Lora",
            fontSize=9.8,
            leading=14.1,
            textColor=BLUE,
            spaceAfter=6.5,
        ),
        "body_tight": ParagraphStyle(
            "BodyTight",
            parent=base["BodyText"],
            fontName="Lora",
            fontSize=9.35,
            leading=13.3,
            textColor=BLUE,
            spaceAfter=4.5,
        ),
        "lead": ParagraphStyle(
            "Lead",
            parent=base["BodyText"],
            fontName="Fraunces",
            fontSize=12.2,
            leading=16,
            textColor=BLUE_DARK,
            spaceAfter=8,
        ),
        "small": ParagraphStyle(
            "Small",
            parent=base["BodyText"],
            fontName="Lora",
            fontSize=8.5,
            leading=12,
            textColor=BLUE,
            spaceAfter=3,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base["BodyText"],
            fontName="Lora",
            fontSize=9.5,
            leading=13.6,
            textColor=BLUE,
            leftIndent=14,
            firstLineIndent=0,
            bulletIndent=2,
            spaceAfter=4,
        ),
        "table_head": ParagraphStyle(
            "TableHead",
            parent=base["Normal"],
            fontName="Fraunces",
            fontSize=8.7,
            leading=11,
            textColor=RED,
        ),
        "table_body": ParagraphStyle(
            "TableBody",
            parent=base["Normal"],
            fontName="Lora",
            fontSize=8.25,
            leading=11.3,
            textColor=BLUE,
        ),
        "table_body_bold": ParagraphStyle(
            "TableBodyBold",
            parent=base["Normal"],
            fontName="Fraunces",
            fontSize=8.5,
            leading=11.3,
            textColor=BLUE_DARK,
        ),
        "callout": ParagraphStyle(
            "Callout",
            parent=base["BodyText"],
            fontName="Lora",
            fontSize=9.35,
            leading=13.6,
            textColor=BLUE,
        ),
        "formula": ParagraphStyle(
            "Formula",
            parent=base["Normal"],
            fontName="Fraunces",
            fontSize=10.5,
            leading=14,
            textColor=BLUE_DARK,
            alignment=TA_CENTER,
        ),
        "status": ParagraphStyle(
            "Status",
            parent=base["Heading2"],
            fontName="Fraunces",
            fontSize=16,
            leading=19,
            textColor=RED,
            spaceBefore=6,
            spaceAfter=7,
        ),
        "quote": ParagraphStyle(
            "Quote",
            parent=base["BodyText"],
            fontName="Fraunces",
            fontSize=11,
            leading=14,
            textColor=BLUE_DARK,
            spaceAfter=2,
        ),
    }


def paragraph(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text, style)


def heading(text: str, styles: dict[str, ParagraphStyle], level: int = 1) -> Paragraph:
    return paragraph(text, styles[f"h{level}"])


def callout(
    title: str,
    text: str,
    styles: dict[str, ParagraphStyle],
    accent: colors.Color = RED,
) -> Table:
    content = paragraph(f"<b>{title}</b><br/>{text}", styles["callout"])
    box = Table([[content]], colWidths=[CONTENT_W], hAlign="LEFT")
    box.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), CARD),
                ("LINEBEFORE", (0, 0), (0, -1), 3, accent),
                ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
                ("LEFTPADDING", (0, 0), (-1, -1), 13),
                ("RIGHTPADDING", (0, 0), (-1, -1), 13),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return box


def formula_box(text: str, styles: dict[str, ParagraphStyle]) -> Table:
    box = Table([[paragraph(text, styles["formula"])]], colWidths=[CONTENT_W], hAlign="LEFT")
    box.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PALE),
                ("BOX", (0, 0), (-1, -1), 0.8, BORDER),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return box


def bullet(text: str, styles: dict[str, ParagraphStyle]) -> Paragraph:
    return Paragraph(text, styles["bullet"], bulletText="•")


def numbered_steps(items: list[str], styles: dict[str, ParagraphStyle]) -> Table:
    rows = [[NumberBadge(i + 1), paragraph(item, styles["body_tight"])] for i, item in enumerate(items)]
    table = Table(rows, colWidths=[24, CONTENT_W - 24], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return table


def checklist(items: list[str], styles: dict[str, ParagraphStyle]) -> Table:
    rows = [[CheckSquare(), paragraph(item, styles["body_tight"])] for item in items]
    table = Table(rows, colWidths=[20, CONTENT_W - 20], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), CARD),
                ("BOX", (0, 0), (-1, -1), 0.7, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (0, -1), 8),
                ("RIGHTPADDING", (0, 0), (0, -1), 2),
                ("LEFTPADDING", (1, 0), (1, -1), 2),
                ("RIGHTPADDING", (1, 0), (1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def data_table(
    rows: list[list[str]],
    widths: list[float],
    styles: dict[str, ParagraphStyle],
    bold_first_column: bool = False,
) -> Table:
    rendered: list[list[Paragraph]] = []
    for row_index, row in enumerate(rows):
        rendered_row = []
        for column_index, value in enumerate(row):
            if row_index == 0:
                style = styles["table_head"]
            elif bold_first_column and column_index == 0:
                style = styles["table_body_bold"]
            else:
                style = styles["table_body"]
            rendered_row.append(paragraph(value, style))
        rendered.append(rendered_row)

    table = Table(rendered, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), PALE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [CARD, BG]),
                ("BOX", (0, 0), (-1, -1), 0.7, BORDER),
                ("INNERGRID", (0, 0), (-1, -1), 0.45, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return table


def add_body(story: list[Flowable], styles: dict[str, ParagraphStyle], *texts: str) -> None:
    story.extend(paragraph(text, styles["body"]) for text in texts)


def draw_page(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFillColor(BG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)

    if doc.page > 1:
        sections = {
            2: "DEIN WEG",
            3: "STUFE 1",
            4: "STUFE 1",
            5: "STUFE 2",
            6: "STUFE 2",
            7: "STUFE 2",
            8: "STUFE 2",
            9: "STUFE 2",
            10: "SONDERFALL",
            11: "DEIN STATUS",
            12: "DEIN STATUS",
            13: "DEIN STATUS",
            14: "DEIN STATUS",
            15: "ZAHLEN 2026",
            16: "ZUM SCHLUSS",
        }
        canvas.setFillColor(RED)
        canvas.setFont("Fraunces", 14)
        canvas.drawString(MARGIN_X, PAGE_H - 14 * mm, "Heinzelchen")
        canvas.setFillColor(BLUE)
        canvas.setFont("Fraunces", 8)
        canvas.drawRightString(PAGE_W - MARGIN_X, PAGE_H - 13.4 * mm, sections.get(doc.page, "LEITFADEN 2026"))

    canvas.setFillColor(BLUE)
    canvas.setFont("Lora", 7.5)
    canvas.drawString(MARGIN_X, 10 * mm, "heinzelchen.com  ·  info@heinzelchen.com")
    canvas.drawRightString(PAGE_W - MARGIN_X, 10 * mm, f"Seite {doc.page}")
    canvas.restoreState()


def build_story(repo_root: Path, styles: dict[str, ParagraphStyle]) -> list[Flowable]:
    story: list[Flowable] = []

    # Page 1: cover
    logo = Image(str(repo_root / "assets" / "finales-heinzelchen-logo-transparent.png"), width=92 * mm, height=61.3 * mm)
    logo.hAlign = "CENTER"
    story.extend(
        [
            Spacer(1, 2 * mm),
            logo,
            Spacer(1, 2 * mm),
            paragraph("LEITFADEN 2026", styles["cover_eyebrow"]),
            paragraph("Steuern und Versicherung<br/>für Heinzelchen", styles["cover_title"]),
            paragraph("Was du anmelden, versteuern und versichern musst", styles["cover_subtitle"]),
            paragraph("Stand: August 2026 · Alle Werte gelten für das Steuerjahr 2026", styles["cover_meta"]),
            callout(
                "Wichtiger Hinweis",
                "Dieses Handout gibt einen allgemeinen Überblick und ersetzt keine steuerliche, rechtliche oder versicherungsfachliche Beratung im Einzelfall. Verbindliche Auskünfte geben nur dein Finanzamt, ein Steuerberater, ein Lohnsteuerhilfeverein oder dein Versicherer. Bei Sozialleistungen (BAföG, Bürgergeld, ALG I) ist immer die zuständige Behörde maßgeblich.",
                styles,
            ),
            Spacer(1, 5 * mm),
            heading("Das Wichtigste vorweg", styles, 2),
            paragraph(
                "Nach unseren Nutzungsbedingungen bist du als Heinzelchen <b>selbstständig tätig</b> (§ 2 und § 3). Du bist kein Angestellter - weder von Heinzelchen noch von deinem Kunden. Du bekommst dein Geld direkt vom Kunden und bist allein dafür verantwortlich, es korrekt zu versteuern und dich abzusichern.",
                styles["body"],
            ),
            paragraph("Das klingt nach viel. Ist es aber nicht - jedenfalls nicht am Anfang.", styles["lead"]),
            PageBreak(),
        ]
    )

    # Page 2: overview and stage 1
    story.extend(
        [
            heading("Dein Weg in drei Stufen", styles),
            data_table(
                [
                    ["Status", "Wann das für dich gilt", "Steuerlich", "Versicherung"],
                    ["Stufe 1<br/>Gelegenheitshilfe", "Du hilfst ab und zu aus, unter 256 € Gewinn im Jahr", "Nichts anzumelden", "Haftpflicht prüfen"],
                    ["Stufe 2<br/>Nebengewerbe", "Du arbeitest regelmäßig - der Normalfall", "Finanzamt + meist Gewerbeamt", "Betriebshaftpflicht, BG, Krankenkasse informieren"],
                    ["Sonderfall<br/>Anstellung im Haushalt", "Ein Kunde stellt dich fest an", "Der Kunde erledigt alles", "Über den Arbeitgeber abgedeckt"],
                ],
                [39 * mm, 49 * mm, 37 * mm, 45 * mm],
                styles,
                bold_first_column=True,
            ),
            Spacer(1, 3 * mm),
            paragraph("Der Sonderfall läuft nicht über Heinzelchen - Erklärung dazu weiter unten.", styles["small"]),
            heading("Stufe 1 - Gelegenheitshilfe", styles),
            paragraph("Steuerlich: nichts zu tun · Versicherung: Haftpflicht klären", styles["lead"]),
            paragraph(
                "Das ist dein Status, wenn du <b>ab und zu</b> aushilfst, ohne die Absicht, daraus etwas Regelmäßiges zu machen. Steuerlich heißt das „sonstige Einkünfte“ (§ 22 Nr. 3 EStG).",
                styles["body"],
            ),
            heading("1.1 Steuern: die 256-Euro-Regel", styles, 2),
            paragraph(
                "Bleiben deine Einkünfte aus dieser Tätigkeit im gesamten Kalenderjahr <b>unter 256 €</b>, sind sie vollständig steuerfrei. Kein Formular, keine Anmeldung, keine Angabe in der Steuererklärung.",
                styles["body"],
            ),
            paragraph("<b>Einkünfte heißt: nach Abzug deiner Kosten.</b>", styles["body"]),
            formula_box("Was der Kunde dir zahlt  -  deine Kosten  =  Einkünfte", styles),
            Spacer(1, 2 * mm),
            paragraph(
                "<i>Beispiel:</i> Du mähst dreimal Rasen und bekommst insgesamt 300 €. Du bist jeweils 15 km hin und zurück gefahren, also 90 km × 0,30 € = 27 €, plus 20 € Benzin für den Mäher. Deine Einkünfte: 253 € - steuerfrei.",
                styles["body"],
            ),
            PageBreak(),
        ]
    )

    # Page 3: stage 1 insurance
    story.extend(
        [
            callout(
                "Die wichtigste Warnung in diesem Handout",
                "256 € ist eine <b>Freigrenze, kein Freibetrag</b>. Bei 255 € zahlst du nichts. Bei 256 € wird der komplette Betrag steuerpflichtig - nicht nur der eine Euro darüber. Führe deshalb von Anfang an eine simple Liste.",
                styles,
            ),
            Spacer(1, 4 * mm),
            heading("1.2 Versicherung: der Punkt, der auch in Stufe 1 gilt", styles, 2),
            paragraph(
                "Bei der Registrierung bestätigst du nach § 3 Abs. 1 der Nutzungsbedingungen, dass du eine <b>Haftpflichtversicherung</b> hast, die selbstständige Nebentätigkeiten dieser Art abdeckt. Das gilt unabhängig davon, wie wenig du verdienst - auch beim ersten 30-Euro-Auftrag.",
                styles["body"],
            ),
            paragraph(
                "<b>Das Problem:</b> Die meisten privaten Haftpflichtversicherungen schließen Schäden bei entgeltlicher oder gewerblicher Tätigkeit ausdrücklich aus. Wenn du beim Rasenmähen einen Stein gegen die Terrassentür schleuderst, zahlst du das im Zweifel selbst - und eine kaputte Scheibe kostet schnell mehr, als du in einem ganzen Jahr als Heinzelchen verdienst.",
                styles["body"],
            ),
            paragraph("Was du tun solltest, bevor du den ersten Auftrag annimmst:", styles["h3"]),
            numbered_steps(
                [
                    "Ruf deinen Versicherer an. Frag konkret: „Sind Schäden gedeckt, die ich bei einer bezahlten selbstständigen Nebentätigkeit im Haushalt oder Garten von Kunden verursache?“",
                    "Lass dir die Antwort schriftlich geben.",
                    "Falls nein: Eine Betriebshaftpflicht für Kleingewerbe kostet häufig unter 100 € im Jahr.",
                ],
                styles,
            ),
            Spacer(1, 2 * mm),
            paragraph(
                "Heinzelchen prüft deine Angabe nicht (§ 3 Abs. 2). Falsche Angaben können zur Sperrung und zu Schadensersatzforderungen führen.",
                styles["body"],
            ),
            heading("1.3 Wann Stufe 1 endet - der entscheidende Punkt", styles, 2),
            paragraph(
                "Stufe 1 hängt nicht am Betrag. Sie hängt daran, ob du <b>nachhaltig tätig</b> bist. Und „nachhaltig“ bedeutet im Steuerrecht nicht „oft“, sondern: mit der Absicht, es zu wiederholen.",
                styles["body"],
            ),
            paragraph(
                "Sobald du dich auf einer Plattform registrierst, um laufend Aufträge zu bekommen, spricht viel dafür, dass diese Absicht besteht. Im Zweifel bist du dann <b>ab dem ersten Auftrag in Stufe 2</b> - auch bei 40 €.",
                styles["body"],
            ),
            PageBreak(),
        ]
    )

    # Page 4: transition and consequences
    story.extend(
        [
            heading("Woran du Stufe 1 und Stufe 2 erkennst", styles),
            data_table(
                [
                    ["Du bist noch in Stufe 1, wenn ...", "Du bist in Stufe 2, wenn ..."],
                    ["du ein-, zweimal spontan ausgeholfen hast", "du dein Profil pflegst, um regelmäßig Anfragen zu bekommen"],
                    ["du keine feste Absicht hast, weiterzumachen", "du dich um mehrere Aufträge bemühst"],
                    ["du kein Werkzeug dafür angeschafft hast", "du einen festen Stundensatz systematisch anwendest"],
                    ["es bei Einzelfällen bleibt", "du planst, das über Monate weiterzumachen"],
                ],
                [85 * mm, 85 * mm],
                styles,
            ),
            Spacer(1, 4 * mm),
            callout(
                "Faustregel",
                "Wenn du beim dritten Auftrag noch dabei bist und weitermachen willst, geh von Stufe 2 aus und melde dich an. Das ist unaufwendiger, als es später zu korrigieren.",
                styles,
                accent=BLUE,
            ),
            Spacer(1, 4 * mm),
            heading("1.4 Was Stufe 1 ausdrücklich nicht bedeutet", styles, 2),
            paragraph("Hier passieren die teuren Missverständnisse. Steuerfrei heißt nicht folgenlos:", styles["body"]),
            bullet("<b>Sozialleistungen rechnen trotzdem an.</b> Jobcenter, Agentur für Arbeit und BAföG-Amt interessiert die steuerliche Einordnung nicht. Für die sind 200 € einfach 200 € - meldepflichtig ab dem ersten Euro. Siehe deinen Statusabschnitt weiter unten.", styles),
            bullet("<b>Die Familienversicherung rechnet ebenfalls an.</b> Die Grenze von 565 €/Monat bezieht sich auf dein Gesamteinkommen, nicht auf dein steuerpflichtiges Einkommen.", styles),
            bullet("<b>Du kannst den Kunden nicht einfach mitnehmen.</b> Nach § 7 der Nutzungsbedingungen darfst du 12 Monate lang keine Folgeaufträge außerhalb der Plattform mit vermittelten Kunden vereinbaren. Unter der 256-€-Grenze zu bleiben, indem du den Rest privat abwickelst, funktioniert also nicht.", styles),
            heading("1.5 Deine To-do-Liste in Stufe 1", styles, 2),
            checklist(
                [
                    "Haftpflichtversicherung geklärt - schriftlich",
                    "Einfache Liste führen: Datum, Kunde, Betrag, gefahrene Kilometer",
                    "Quittungen für deine Kosten aufheben",
                    "Bei Sozialleistungen oder BAföG: Behörde informieren",
                    "Bei 200 € gegenzählen - und den Wechsel zu Stufe 2 vorbereiten",
                ],
                styles,
            ),
            PageBreak(),
        ]
    )

    # Page 5: stage 2 begins
    story.extend(
        [
            heading("Stufe 2 - Nebengewerbe", styles),
            paragraph("Steuerlich: zwei Anmeldungen · Versicherung: drei Stellen informieren", styles["lead"]),
            paragraph("Sobald du regelmäßig arbeitest, bist du steuerlich Unternehmer. Das klingt größer, als es ist.", styles["body"]),
            heading("Teil A: Steuern", styles, 2),
            heading("2.1 Beim Finanzamt anmelden", styles, 2),
            paragraph(
                "Innerhalb eines Monats nach Aufnahme der Tätigkeit füllst du online über ELSTER den „Fragebogen zur steuerlichen Erfassung“ aus. Kostenlos, dauert etwa 30 Minuten.",
                styles["body"],
            ),
            paragraph("Du bekommst danach eine <b>Steuernummer</b>, die auf jede deiner Rechnungen gehört.", styles["body"]),
            paragraph(
                "Beim Ausfüllen wirst du nach dem voraussichtlichen Gewinn gefragt. Schätze ehrlich und eher niedrig - daran bemisst sich, ob das Finanzamt Vorauszahlungen festsetzt. Bei kleinen Nebentätigkeiten passiert das in der Regel nicht.",
                styles["body"],
            ),
            heading("2.2 Gewerbe anmelden", styles, 2),
            data_table(
                [
                    ["Deine Tätigkeit", "Gewerbe nötig?"],
                    ["Rasenmähen, Gartenarbeit, Putzen, Einkaufen, Umzugshilfe, Möbelaufbau, Hundesitting", "<b>Ja</b>"],
                    ["Nachhilfe, Musikunterricht, Sprachunterricht", "<b>Nein</b> - freiberufliche unterrichtende Tätigkeit (§ 18 EStG). Nur Finanzamt."],
                    ["Kinderbetreuung", "Kommt auf die Ausgestaltung an - beim Gewerbeamt nachfragen"],
                ],
                [100 * mm, 70 * mm],
                styles,
            ),
            Spacer(1, 3 * mm),
            paragraph(
                "<b>So geht's:</b> Formlos beim Gewerbeamt deiner Stadt oder Gemeinde, oft online. Kosten je nach Kommune ca. 20-60 €. Als Tätigkeit gibst du zum Beispiel an: <i>„Erbringung einfacher haushaltsnaher Dienstleistungen und Gartenpflege“</i>. Formuliere lieber etwas breiter, dann musst du nicht nachmelden, wenn du später zusätzlich Fenster putzt.",
                styles["body_tight"],
            ),
            PageBreak(),
        ]
    )

    # Page 6: business registration and income tax
    story.extend(
        [
            heading("Gewerbe und Einkommensteuer", styles),
            paragraph(
                "Das Gewerbeamt informiert Finanzamt und IHK automatisch weiter. Die <b>IHK-Mitgliedschaft</b> ist Pflicht, aber Kleingewerbetreibende mit geringem Gewinn sind regelmäßig beitragsfrei gestellt.",
                styles["body"],
            ),
            callout(
                "Was du nicht darfst",
                "Nach § 6 der Nutzungsbedingungen keine Tätigkeiten annehmen, die eine gewerberechtliche Zulassung erfordern, die du nicht hast - insbesondere Arbeiten am Stromnetz und an Gasanschlüssen. Auch etliche Handwerksleistungen sind zulassungspflichtig. Einfache Garten-, Reinigungs- und Haushaltsarbeiten sind es nicht.",
                styles,
            ),
            Spacer(1, 4 * mm),
            heading("2.3 Einkommensteuer", styles, 2),
            paragraph("Versteuert wird dein <b>Gewinn</b>, nicht dein Umsatz:", styles["body"]),
            formula_box("Einnahmen  -  Betriebsausgaben  =  Gewinn", styles),
            Spacer(1, 3 * mm),
            paragraph(
                "<b>Typische Betriebsausgaben:</b> Fahrtkosten zum Auftrag (0,30 €/km), Arbeitskleidung und Handschuhe, Werkzeug, Sprit für den Rasenmäher, Reinigungsmittel, anteilige Handykosten, Gewerbeanmeldung, Beiträge zur Betriebshaftpflicht.",
                styles["body"],
            ),
            paragraph("Wann fällt tatsächlich Steuer an?", styles["h3"]),
            data_table(
                [
                    ["Situation", "Ergebnis"],
                    ["Deine gesamten Einkünfte im Jahr (alle Quellen) liegen unter 12.348 €", "Keine Einkommensteuer"],
                    ["Du hast daneben einen normalen Job und dein Gewinn liegt unter 410 € im Jahr", "Bleibt steuerfrei (Härteausgleich)"],
                    ["Gewinn zwischen 410 € und 820 € neben Arbeitslohn", "Nur anteilig steuerpflichtig"],
                    ["Alles darüber", "Normal steuerpflichtig"],
                ],
                [110 * mm, 60 * mm],
                styles,
            ),
            Spacer(1, 3 * mm),
            paragraph(
                "<b>Steuererklärung:</b> Pflicht, sobald dein Gewinn neben einem Arbeitslohn über 410 € liegt oder deine Gesamteinkünfte über dem Grundfreibetrag liegen. Du brauchst dann die Anlage EÜR plus Anlage G (Gewerbe) beziehungsweise Anlage S (freiberuflich). Frist: 31. Juli des Folgejahres.",
                styles["body_tight"],
            ),
            PageBreak(),
        ]
    )

    # Page 7: VAT and receipts
    story.extend(
        [
            heading("Umsatzsteuer und Nachweise", styles),
            paragraph(
                "Auch ohne Pflicht lohnt sich die Erklärung häufig - etwa wenn dir aus einem anderen Job Lohnsteuer abgezogen wurde.",
                styles["body"],
            ),
            heading("2.4 Umsatzsteuer - für dich fast sicher irrelevant", styles, 2),
            paragraph(
                "Du kannst die <b>Kleinunternehmerregelung</b> (§ 19 UStG) nutzen, solange dein Umsatz im Vorjahr unter 25.000 € lag und im laufenden Jahr unter 100.000 € bleibt.",
                styles["body"],
            ),
            paragraph("Dann weist du keine Umsatzsteuer aus und gibst keine Voranmeldungen ab. Pflichthinweis auf jeder Rechnung:", styles["body"]),
            formula_box("„Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.“", styles),
            Spacer(1, 3 * mm),
            callout("Wichtig", "Weder Steuersatz noch Steuerbetrag dürfen auf der Rechnung stehen.", styles),
            Spacer(1, 4 * mm),
            heading("2.5 Gewerbesteuer", styles, 2),
            paragraph("Erst ab <b>24.500 € Gewinn</b> im Jahr. Für Nebentätigkeiten praktisch nie relevant.", styles["body"]),
            heading("2.6 Quittungen - bei Heinzelchen besonders wichtig", styles, 2),
            paragraph(
                "Du bekommst dein Geld direkt vom Kunden (§ 3 Abs. 4 und § 5). Heinzelchen wickelt keine Zahlungen ab und stellt dir deshalb auch keine Umsatzübersicht aus.",
                styles["body"],
            ),
            paragraph("Das heißt: <b>Du bist dein eigener Buchhalter.</b> Es gibt keine Plattform-Abrechnung, auf die du dich später berufen kannst.", styles["body"]),
            paragraph(
                "Schreib für jeden Auftrag eine kurze Rechnung oder Quittung - Datum, Leistung, Stunden, Betrag, dein Name, deine Steuernummer, der Kleinunternehmer-Hinweis. Eine Kopie für dich, eine für den Kunden.",
                styles["body"],
            ),
            paragraph(
                "Das nützt auch deinem Kunden: Er kann 20 % der Kosten, maximal 4.000 € im Jahr, von seiner Steuer abziehen (§ 35a EStG) - aber nur bei Überweisung, nicht bei Barzahlung. Ein guter Grund, um Überweisung zu bitten.",
                styles["body"],
            ),
            PageBreak(),
        ]
    )

    # Page 8: liability and accident insurance
    story.extend(
        [
            heading("Teil B: Versicherung", styles),
            paragraph("In Stufe 2 musst du drei Stellen im Blick haben.", styles["lead"]),
            heading("2.7 Haftpflicht - jetzt wird sie zur Betriebshaftpflicht", styles, 2),
            paragraph(
                "Was in Stufe 1 schon galt, wird jetzt dringender: Spätestens mit der Gewerbeanmeldung ist klar, dass du gewerblich tätig bist. Damit greift der Ausschluss in privaten Haftpflichtpolicen praktisch immer.",
                styles["body"],
            ),
            callout(
                "Der wichtigste Baustein",
                "Eine Betriebshaftpflicht für Kleingewerbe kostet häufig unter 100 € im Jahr und ist als Betriebsausgabe absetzbar. Das ist der günstigste Baustein deiner Selbstständigkeit - und der wichtigste.",
                styles,
                accent=BLUE,
            ),
            Spacer(1, 5 * mm),
            heading("2.8 Berufsgenossenschaft - Meldepflicht binnen einer Woche", styles, 2),
            paragraph(
                "Als Unternehmer musst du dich <b>innerhalb einer Woche</b> nach Aufnahme der Tätigkeit bei der zuständigen Berufsgenossenschaft anmelden (§ 192 SGB VII). Bei Garten- und Grünpflege kann die SVLFG zuständig sein - dort kann sogar eine <b>Pflichtversicherung für Unternehmer</b> bestehen, nicht nur eine Meldepflicht.",
                styles["body"],
            ),
            paragraph("Ruf dort einmal an, bevor du startest. Das kostet zehn Minuten und erspart dir Beitragsnachforderungen.", styles["body"]),
            heading("2.9 Krankenkasse - aktiv informieren", styles, 2),
            paragraph(
                "Wenn du familienversichert oder studentisch versichert bist, melde deiner Krankenkasse die Selbstständigkeit. Tust du das nicht, kann die Kasse die günstige Einstufung später rückwirkend bis zum Tag der Gewerbeanmeldung kassieren - mit Beitragsnachzahlung für den gesamten Zeitraum.",
                styles["body"],
            ),
            paragraph("Die konkreten Grenzen findest du in deinem Statusabschnitt weiter unten.", styles["body"]),
            PageBreak(),
        ]
    )

    # Page 9: pension and checklist
    story.extend(
        [
            heading("Rentenversicherung und deine To-do-Liste", styles),
            heading("2.10 Rentenversicherung", styles, 2),
            paragraph(
                "Wer dauerhaft im Wesentlichen nur für einen einzigen Auftraggeber arbeitet, kann rentenversicherungspflichtig werden (§ 2 SGB VI). Über die Plattform mit wechselnden Kunden ist das normalerweise unproblematisch - genau deshalb erlauben dir die Nutzungsbedingungen ausdrücklich, auch für andere Auftraggeber tätig zu sein (§ 2 Abs. 3).",
                styles["body"],
            ),
            heading("2.11 Deine To-do-Liste in Stufe 2", styles, 2),
            checklist(
                [
                    "Fragebogen zur steuerlichen Erfassung über ELSTER",
                    "Gewerbe angemeldet (falls erforderlich)",
                    "Betriebshaftpflicht abgeschlossen",
                    "Berufsgenossenschaft kontaktiert",
                    "Krankenkasse informiert",
                    "Bei Sozialleistungen oder BAföG: Behörde informiert",
                    "Bei Angestellten: Nebentätigkeit beim Arbeitgeber angezeigt",
                    "Quittungsvorlage angelegt",
                ],
                styles,
            ),
            Spacer(1, 5 * mm),
            callout(
                "Kurz zusammengefasst",
                "Regelmäßig arbeiten heißt: Finanzamt informieren, Gewerbe prüfen, Betriebshaftpflicht klären, Berufsgenossenschaft kontaktieren und die Krankenkasse aktiv einbeziehen.",
                styles,
                accent=BLUE,
            ),
            PageBreak(),
        ]
    )

    # Page 10: household employment and status intro
    story.extend(
        [
            heading("Sonderfall - Anstellung im Privathaushalt", styles),
            paragraph("Läuft nicht über Heinzelchen", styles["lead"]),
            paragraph(
                "Ein Privathaushalt kann eine Haushaltshilfe auch <b>anstellen</b> statt sie zu beauftragen - über das <b>Haushaltsscheck-Verfahren</b> der Minijob-Zentrale. Dann ist der Kunde dein Arbeitgeber, meldet dich an und zahlt die Pauschalabgaben.",
                styles["body"],
            ),
            paragraph(
                "Für dich hieße das: keine Lohnsteuer, keine Kranken-, Pflege- oder Arbeitslosenversicherung, kein Gewerbe, keine Steuererklärung, <b>Unfallversicherung über den Arbeitgeber</b>. Grenze: <b>603 € im Monat</b> über alle Minijobs zusammen.",
                styles["body"],
            ),
            paragraph(
                "<b>Warum das über Heinzelchen nicht geht:</b> Nach § 3 Abs. 1 bestätigst du bei der Registrierung ausdrücklich deine selbstständige Tätigkeit, und nach § 4 Abs. 4 meldet Heinzelchen niemanden bei der Minijob-Zentrale an. Außerdem gilt das Umgehungsverbot aus § 7.",
                styles["body"],
            ),
            callout(
                "Wenn ein Kunde dich fest anstellen möchte",
                "Sprich uns vorher an. Wir klären das dann sauber, statt dass du in einen Konflikt mit den Nutzungsbedingungen gerätst.",
                styles,
            ),
            Spacer(1, 5 * mm),
            heading("Dein Status - was zusätzlich für dich gilt", styles),
            paragraph(
                "Die Regeln oben gelten für alle gleich. <b>Was sich unterscheidet, sind die Nebenwirkungen</b> auf Versicherung, Förderung und Sozialleistungen. Diese Grenzen liegen oft weit unter dem Grundfreibetrag - hier passieren die teuren Fehler.",
                styles["body"],
            ),
            callout(
                "Hinweis",
                "Heinzelchen setzt ein Mindestalter von 18 Jahren voraus (§ 3 Abs. 1). Alle folgenden Abschnitte gehen davon aus, dass du volljährig bist.",
                styles,
                accent=BLUE,
            ),
            PageBreak(),
        ]
    )

    # Page 11: students
    story.extend(
        [
            paragraph("Studierende", styles["status"]),
            paragraph("Drei Grenzen gelten gleichzeitig. Die niedrigste ist für dich bindend.", styles["lead"]),
            heading("Krankenversicherung", styles, 2),
            data_table(
                [
                    ["Situation", "Grenze"],
                    ["Familienversichert über die Eltern (bis 25)", "Gewinn max. 565 €/Monat"],
                    ["Eigene studentische Krankenversicherung (KVdS)", "Keine Einkommensgrenze, aber Zeitgrenze beachten"],
                ],
                [100 * mm, 70 * mm],
                styles,
            ),
            Spacer(1, 3 * mm),
            paragraph(
                "<b>Zeitgrenze:</b> In der Vorlesungszeit darfst du nicht regelmäßig mehr als <b>20 Stunden pro Woche</b> arbeiten. Sonst stuft dich die Krankenkasse als hauptberuflich selbstständig ein und du verlierst die günstige studentische Versicherung. In den Semesterferien darfst du mehr arbeiten.",
                styles["body"],
            ),
            paragraph(
                "<b>Zweite Reißleine:</b> Übersteigt dein Gewinn <b>2.966,25 €/Monat</b>, giltst du unabhängig von der Stundenzahl als hauptberuflich selbstständig.",
                styles["body"],
            ),
            heading("BAföG - die größte Falle für Heinzelchen", styles, 2),
            data_table(
                [
                    ["Art des Einkommens", "Anrechnungsfrei"],
                    ["Angestelltentätigkeit / Minijob", "ca. 603 €/Monat brutto"],
                    ["Selbstständige Tätigkeit - also Heinzelchen", "nur 389 €/Monat Gewinn (4.668 €/Jahr)"],
                ],
                [100 * mm, 70 * mm],
                styles,
            ),
            Spacer(1, 3 * mm),
            paragraph(
                "Der Unterschied entsteht, weil bei nichtselbstständiger Arbeit zusätzlich Werbungskosten- und Sozialpauschale abgezogen werden. Als selbstständiges Heinzelchen hast du spürbar weniger Spielraum als jemand mit einem klassischen Studentenjob.",
                styles["body_tight"],
            ),
            paragraph(
                "Gerechnet wird über den gesamten Bewilligungszeitraum (meist 12 Monate), nicht Monat für Monat. Deine Betriebsausgaben mindern den Gewinn und damit die Anrechnung - noch ein Grund, Belege zu sammeln.",
                styles["body_tight"],
            ),
            PageBreak(),
        ]
    )

    # Page 12: students and pupils
    story.extend(
        [
            heading("Kindergeld", styles, 2),
            paragraph(
                "Während deiner Erstausbildung (erstes Studium) bis 25: keine Einkommensgrenze. Nach abgeschlossener Erstausbildung (z. B. im Master) entfällt es, wenn du regelmäßig mehr als 20 Std./Woche arbeitest.",
                styles["body"],
            ),
            heading("Studierende aus Nicht-EU-Ländern - bitte unbedingt lesen", styles, 2),
            paragraph("Mit einer Aufenthaltserlaubnis nach § 16b AufenthG gilt:", styles["body"]),
            bullet("<b>Beschäftigung:</b> max. 140 volle oder 280 halbe Arbeitstage im Kalenderjahr", styles),
            bullet("<b>Selbstständige Tätigkeit ist grundsätzlich NICHT erlaubt.</b> Du brauchst dafür eine ausdrückliche Genehmigung der Ausländerbehörde.", styles),
            callout(
                "Das betrifft dich direkt",
                "Da du als Heinzelchen selbstständig tätig bist, betrifft dich das direkt. Ein Gewerbe ohne Genehmigung anzumelden ist eine Ordnungswidrigkeit (Bußgeld bis 5.000 €) und kann deinen Aufenthaltstitel gefährden. Kläre das vor deinem ersten Auftrag mit deiner Ausländerbehörde. Wenn du unsicher bist, melde dich bei uns, bevor du loslegst.",
                styles,
            ),
            Spacer(1, 5 * mm),
            paragraph("Volljährige Schüler und Berufsschüler", styles["status"]),
            bullet("<b>Steuer:</b> Eigener Grundfreibetrag von 12.348 €. Praktisch zahlst du nie Einkommensteuer.", styles),
            bullet("<b>Kindergeld:</b> Läuft ab 18 weiter, solange du in Schule oder Ausbildung bist - unabhängig vom Verdienst.", styles),
            bullet("<b>Krankenversicherung:</b> Über die Eltern familienversichert bis 25, solange dein Gewinn 565 €/Monat nicht übersteigt.", styles),
            bullet("<b>Wenn deine Familie Bürgergeld bezieht:</b> In den Schulferien ist dein Verdienst unbegrenzt anrechnungsfrei (§ 11a Abs. 7 SGB II), außerhalb der Ferien bis 603 €/Monat. Gilt bis zum 25. Geburtstag. Melde den Job trotzdem beim Jobcenter.", styles),
            bullet("<b>Auszubildende:</b> Sieh in deinen Ausbildungsvertrag - viele verlangen, dass du Nebentätigkeiten anzeigst.", styles),
            PageBreak(),
        ]
    )

    # Page 13: employees and unemployment benefit I
    story.extend(
        [
            paragraph("Angestellte", styles["status"]),
            numbered_steps(
                [
                    "<b>Arbeitsvertrag:</b> Die meisten Verträge verlangen, dass du eine Nebentätigkeit anzeigst oder genehmigen lässt.",
                    "<b>Arbeitszeitgesetz:</b> Alle Tätigkeiten zusammen dürfen 10 Stunden am Tag nicht überschreiten. Die Grenze gilt für dich als Person, nicht pro Arbeitgeber.",
                    "<b>Steuer:</b> Gewinn über 410 €/Jahr macht die Steuererklärung zur Pflicht.",
                    "<b>Krankenversicherung:</b> Solange dein Hauptjob den Schwerpunkt bildet, gilt die Selbstständigkeit als nebenberuflich - keine zusätzlichen Beiträge.",
                    "<b>Unfallversicherung:</b> Deine Absicherung über den Arbeitgeber gilt nicht für deine Heinzelchen-Aufträge. Siehe Abschnitt 2.8.",
                ],
                styles,
            ),
            Spacer(1, 5 * mm),
            paragraph("Arbeitsuchende mit Arbeitslosengeld I", styles["status"]),
            data_table(
                [
                    ["Regel", "Wert"],
                    ["Maximale Arbeitszeit", "unter 15 Std./Woche"],
                    ["Anrechnungsfrei", "165 €/Monat netto"],
                    ["Alles darüber", "wird zu 100 % vom ALG I abgezogen"],
                ],
                [95 * mm, 75 * mm],
                styles,
            ),
            Spacer(1, 3 * mm),
            paragraph("<b>Ab 15 Std./Woche verlierst du den ALG-I-Anspruch komplett</b> - unabhängig davon, wie wenig du verdienst.", styles["body"]),
            paragraph(
                "Melde die Tätigkeit <b>vor Aufnahme</b>. Für die Selbstständigkeit brauchst du die „Erklärung zur selbstständigen Tätigkeit“. Versäumte Meldungen führen zu Rückforderungen.",
                styles["body"],
            ),
            paragraph("<b>Tipp:</b> Nachgewiesene Betriebsausgaben erhöhen deinen Freibetrag über die 165 € hinaus.", styles["body"]),
            PageBreak(),
        ]
    )

    # Page 14: citizen benefit, pensioners, parental leave
    story.extend(
        [
            paragraph("Arbeitsuchende mit Bürgergeld / Grundsicherung", styles["status"]),
            data_table(
                [
                    ["Verdienst", "Davon bleibt dir"],
                    ["erste 100 €", "100 € (Grundfreibetrag)"],
                    ["100-1.000 €", "20 %"],
                    ["1.000-1.200 €", "10 %"],
                ],
                [85 * mm, 85 * mm],
                styles,
            ),
            Spacer(1, 3 * mm),
            paragraph("Bei 603 € Verdienst bleiben <b>208,90 €</b> anrechnungsfrei.", styles["body"]),
            paragraph(
                "<b>Sonderregel unter 25</b> in Schule, Ausbildung, BAföG-fähigem Studium oder Freiwilligendienst: bis 603 €/Monat vollständig anrechnungsfrei.",
                styles["body"],
            ),
            paragraph("<b>Melde jede Tätigkeit dem Jobcenter - vorher, nicht hinterher.</b>", styles["body"]),
            paragraph("Rentner", styles["status"]),
            paragraph("Nach Erreichen der Regelaltersgrenze darfst du <b>unbegrenzt dazuverdienen</b>, die Rente wird nicht gekürzt.", styles["body"]),
            callout(
                "Die Aktivrente hilft dir hier nicht",
                "Der neue Steuerfreibetrag von 2.000 €/Monat (seit 2026) gilt ausschließlich für sozialversicherungspflichtige Beschäftigung. Selbstständige Tätigkeit, Gewerbebetrieb und Minijobs sind ausdrücklich ausgenommen. Als Heinzelchen kannst du ihn nicht nutzen.",
                styles,
            ),
            Spacer(1, 3 * mm),
            paragraph(
                "Vor der Regelaltersgrenze (vorgezogene Altersrente oder Erwerbsminderungsrente) gelten weiterhin Hinzuverdienstgrenzen - unbedingt vorher bei der Deutschen Rentenversicherung klären. Bei einer Erwerbsminderungsrente kann schon eine geringe Stundenzahl den Anspruch gefährden.",
                styles["body_tight"],
            ),
            paragraph("Elternzeit und Familienarbeit", styles["status"]),
            bullet("<b>Familienversicherung über den Partner:</b> Grenze 565 €/Monat Gesamteinkommen. Mehrere Einkommensquellen werden zusammengerechnet.", styles),
            bullet("<b>Elterngeld:</b> Einkommen im Bezugszeitraum wird angerechnet und mindert das Elterngeld. Bei der Elterngeldstelle melden.", styles),
            bullet("<b>In Elternzeit</b> darfst du bis zu 32 Std./Woche arbeiten, brauchst dafür aber die Zustimmung deines Arbeitgebers.", styles),
            PageBreak(),
        ]
    )

    # Page 15: key figures
    story.extend(
        [
            heading("Die wichtigsten Zahlen 2026", styles),
            paragraph("Alle zentralen Grenzen auf einen Blick. Entscheidend ist immer deine persönliche Situation.", styles["lead"]),
            data_table(
                [
                    ["Was", "Wert"],
                    ["Freigrenze sonstige Einkünfte (Stufe 1)", "<b>256 €</b> / Jahr"],
                    ["Grundfreibetrag Einkommensteuer", "<b>12.348 €</b> / Jahr"],
                    ["Härteausgleich neben Arbeitslohn", "<b>410 €</b> / Jahr"],
                    ["Familienversicherung", "<b>565 €</b> / Monat"],
                    ["BAföG anrechnungsfrei (selbstständig)", "<b>389 €</b> / Monat"],
                    ["ALG I anrechnungsfrei", "<b>165 €</b> / Monat netto"],
                    ["ALG I maximale Arbeitszeit", "unter <b>15 Std.</b> / Woche"],
                    ["Nebenberuflichkeitsgrenze Studierende", "<b>20 Std.</b> / Woche in der Vorlesungszeit"],
                    ["Kleinunternehmergrenze", "<b>25.000 €</b> Vorjahr / <b>100.000 €</b> laufend"],
                    ["Gewerbesteuer-Freibetrag", "<b>24.500 €</b> Gewinn"],
                    ["Fahrtkostenpauschale", "<b>0,30 €</b> / km"],
                    ["Kindergeld", "<b>259 €</b> / Monat"],
                ],
                [105 * mm, 65 * mm],
                styles,
            ),
            Spacer(1, 5 * mm),
            callout(
                "Bitte im Zweifel nachfragen",
                "Viele Grenzen werden jährlich angepasst oder hängen von deiner individuellen Situation ab. Für verbindliche Auskünfte sind Finanzamt, Krankenkasse, Versicherung oder zuständige Leistungsbehörde maßgeblich.",
                styles,
                accent=BLUE,
            ),
            PageBreak(),
        ]
    )

    # Page 16: misconceptions and contact
    misconceptions = [
        ("„Unter 520 € muss ich nichts angeben.“", "Das gilt nur für Minijobs als Angestellter. Als selbstständiges Heinzelchen meldest du dich ab Stufe 2 an - unabhängig vom Betrag."),
        ("„Ich zahle keine Steuern, also brauche ich kein Gewerbe.“", "Zwei verschiedene Dinge. Die Gewerbepflicht hängt an der Regelmäßigkeit deiner Tätigkeit, nicht an deinem Gewinn."),
        ("„Ich verdiene unter 12.348 €, also ist alles egal.“", "Der teuerste Irrtum. Familienversicherung (565 €), BAföG (389 €) und ALG I (165 €) haben viel niedrigere Grenzen. Wer die reißt, zahlt oft mehr nach, als er verdient hat."),
        ("„Meine private Haftpflicht reicht schon.“", "Meistens nicht - entgeltliche Tätigkeit ist fast immer ausgeschlossen. Und das gilt schon in Stufe 1."),
        ("„Bar ist einfacher.“", "Für deinen Kunden ist es teurer - die Steuerermäßigung nach § 35a EStG gibt es nur bei Überweisung. Und weil Heinzelchen keine Zahlungen abwickelt, hast du bei Barzahlung keinerlei Nachweis über deine Einnahmen."),
    ]
    story.append(heading("Die fünf häufigsten Irrtümer", styles))
    for quote, answer in misconceptions:
        story.append(KeepTogether([paragraph(quote, styles["quote"]), paragraph(answer, styles["body_tight"])]))
        story.append(Spacer(1, 2 * mm))
    story.extend(
        [
            Spacer(1, 4 * mm),
            callout(
                "Fragen?",
                "Schreib uns an <link href='mailto:info@heinzelchen.com' color='#A63D52'><u>info@heinzelchen.com</u></link>. Für verbindliche steuerliche Auskünfte wende dich an dein Finanzamt - die Auskunft ist kostenlos, und bei Kleinstgewerben sind die Mitarbeitenden erfahrungsgemäß sehr hilfsbereit.",
                styles,
            ),
            Spacer(1, 7 * mm),
            paragraph("Gut vorbereitet. Selbstständig. Heinzelchen.", styles["cover_subtitle"]),
        ]
    )
    return story


def build_pdf(repo_root: Path, output_path: Path) -> None:
    register_fonts(repo_root)
    styles = build_styles()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=MARGIN_X,
        rightMargin=MARGIN_X,
        topMargin=22 * mm,
        bottomMargin=18 * mm,
        title="Heinzelchen - Steuern und Versicherung 2026",
        author="Heinzelchen",
        subject="Leitfaden für selbstständig tätige Heinzelchen",
        creator="Heinzelchen",
    )
    doc.build(build_story(repo_root, styles), onFirstPage=draw_page, onLaterPages=draw_page)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    repo_root = Path(__file__).resolve().parents[1]
    build_pdf(repo_root, args.output.resolve())


if __name__ == "__main__":
    main()
