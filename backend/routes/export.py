from flask import Blueprint, make_response, g
from models import Workout
from datetime import datetime
import csv
import io
from utils.auth import require_auth

export_bp = Blueprint('export', __name__)


@export_bp.route('/csv', methods=['GET'])
@require_auth
def export_csv():
    workouts = Workout.query.filter_by(user_id=g.current_user.id).order_by(Workout.date.desc()).all()

    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow([
        'Date', 'Workout Name', 'Exercise', 'Category', 'Muscle Group',
        'Set #', 'Weight (lbs)', 'Reps', 'Volume (lbs)', 'Completed',
    ])

    for workout in workouts:
        for we in workout.exercises:
            for s in we.sets:
                writer.writerow([
                    workout.date.strftime('%Y-%m-%d %H:%M'),
                    workout.name,
                    we.exercise.name,
                    we.exercise.category,
                    we.exercise.muscle_group,
                    s.set_number,
                    s.weight,
                    s.reps,
                    round(s.weight * s.reps, 1),
                    'Yes' if s.completed else 'No',
                ])

    resp = make_response(out.getvalue())
    resp.headers['Content-Type'] = 'text/csv'
    resp.headers['Content-Disposition'] = (
        f'attachment; filename=fittrack_{datetime.now().strftime("%Y%m%d")}.csv'
    )
    return resp


@export_bp.route('/pdf', methods=['GET'])
@require_auth
def export_pdf():
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib import colors
        from reportlab.lib.units import inch
    except ImportError:
        return {'error': 'reportlab not installed'}, 500

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        rightMargin=0.75 * inch, leftMargin=0.75 * inch,
        topMargin=inch, bottomMargin=inch,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('T', parent=styles['Heading1'], fontSize=18, spaceAfter=6)
    h2 = ParagraphStyle('H2', parent=styles['Heading2'], fontSize=12, spaceAfter=4, spaceBefore=10)

    story = [
        Paragraph('FitTrack — Workout Report', title_style),
        Paragraph(f'Generated: {datetime.now().strftime("%B %d, %Y")}', styles['Normal']),
        Spacer(1, 0.2 * inch),
    ]

    workouts = Workout.query.filter_by(user_id=g.current_user.id).order_by(Workout.date.desc()).limit(50).all()

    for workout in workouts:
        story.append(Paragraph(
            f'{workout.date.strftime("%B %d, %Y")}  —  {workout.name}', h2
        ))

        rows = [['Exercise', 'Set', 'Weight (lbs)', 'Reps', 'Volume']]
        for we in workout.exercises:
            for s in we.sets:
                rows.append([
                    we.exercise.name,
                    str(s.set_number),
                    str(s.weight),
                    str(s.reps),
                    str(round(s.weight * s.reps, 1)),
                ])

        if len(rows) > 1:
            t = Table(rows, colWidths=[2.5 * inch, 0.5 * inch, 1.2 * inch, 0.7 * inch, 1 * inch])
            t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#18181b')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
                ('PADDING', (0, 0), (-1, -1), 4),
            ]))
            story.append(t)

        story.append(Spacer(1, 0.1 * inch))

    doc.build(story)

    resp = make_response(buf.getvalue())
    resp.headers['Content-Type'] = 'application/pdf'
    resp.headers['Content-Disposition'] = (
        f'attachment; filename=fittrack_{datetime.now().strftime("%Y%m%d")}.pdf'
    )
    return resp
