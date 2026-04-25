from flask import Blueprint, request, jsonify
from extensions import db
from models import FoodLog
from datetime import date as date_type
import os
import requests as http

food_bp = Blueprint('food', __name__)


@food_bp.route('/search', methods=['GET'])
def search_food():
    query = request.args.get('q', '').strip()
    if not query or len(query) < 2:
        return jsonify([])

    api_key = os.getenv('USDA_API_KEY', 'DEMO_KEY')
    try:
        resp = http.get(
            'https://api.nal.usda.gov/fdc/v1/foods/search',
            params={
                'query': query,
                'pageSize': 8,
                'api_key': api_key,
                'dataType': 'SR Legacy,Foundation,Survey (FNDDS)',
            },
            timeout=6,
        )
        resp.raise_for_status()
    except Exception:
        return jsonify({'error': 'Search unavailable'}), 502

    results = []
    for food in resp.json().get('foods', []):
        nutrients = {}
        for n in food.get('foodNutrients', []):
            name = n.get('nutrientName', '')
            # Skip kJ entries for Energy — keep only kcal
            if name == 'Energy' and n.get('unitName', '') != 'KCAL':
                continue
            nutrients[name] = n.get('value') or 0

        servings = []
        for m in food.get('foodMeasures', []):
            label = m.get('disseminationText', '')
            grams = m.get('gramWeight', 0)
            if label and grams and 'not specified' not in label.lower():
                servings.append({'label': label, 'grams': round(grams, 1)})

        results.append({
            'name': food.get('description', ''),
            'calories': round(nutrients.get('Energy', 0)),
            'protein': round(nutrients.get('Protein', 0) * 10) / 10,
            'carbs': round(nutrients.get('Carbohydrate, by difference', 0) * 10) / 10,
            'fat': round(nutrients.get('Total lipid (fat)', 0) * 10) / 10,
            # Foundation: "Sugars, total including NLEA" / SR Legacy: "Sugars, total" / FNDDS: "Total Sugars"
            'sugar_total': round((nutrients.get('Sugars, total including NLEA') or nutrients.get('Sugars, total') or nutrients.get('Total Sugars') or 0) * 10) / 10,
            'sugar_added': round(nutrients.get('Sugars, added', 0) * 10) / 10,
            'servings': servings,
        })

    return jsonify(results)


@food_bp.route('', methods=['GET'])
def get_food_logs():
    date_str = request.args.get('date', date_type.today().isoformat())
    try:
        log_date = date_type.fromisoformat(date_str)
    except ValueError:
        return jsonify({'error': 'Invalid date'}), 400
    logs = FoodLog.query.filter_by(date=log_date).order_by(FoodLog.created_at).all()
    return jsonify([l.to_dict() for l in logs])


@food_bp.route('', methods=['POST'])
def create_food_log():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    date_str = data.get('date', date_type.today().isoformat())
    try:
        log_date = date_type.fromisoformat(date_str)
    except ValueError:
        return jsonify({'error': 'Invalid date'}), 400
    log = FoodLog(
        date=log_date,
        meal_type=data.get('meal_type', 'snack'),
        description=data.get('description', ''),
        calories=int(data.get('calories', 0)),
        protein=float(data.get('protein', 0)),
        carbs=float(data.get('carbs', 0)),
        fat=float(data.get('fat', 0)),
        sugar_total=float(data.get('sugar_total', 0)),
        sugar_added=float(data.get('sugar_added', 0)),
    )
    db.session.add(log)
    db.session.commit()
    return jsonify(log.to_dict()), 201


@food_bp.route('/<int:log_id>', methods=['PUT'])
def update_food_log(log_id):
    log = FoodLog.query.get_or_404(log_id)
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    if 'description' in data:
        log.description = data['description']
    if 'calories' in data:
        log.calories = int(data['calories'])
    if 'meal_type' in data:
        log.meal_type = data['meal_type']
    if 'protein' in data:
        log.protein = float(data['protein'])
    if 'carbs' in data:
        log.carbs = float(data['carbs'])
    if 'fat' in data:
        log.fat = float(data['fat'])
    if 'sugar_total' in data:
        log.sugar_total = float(data['sugar_total'])
    if 'sugar_added' in data:
        log.sugar_added = float(data['sugar_added'])
    db.session.commit()
    return jsonify(log.to_dict())


@food_bp.route('/<int:log_id>', methods=['DELETE'])
def delete_food_log(log_id):
    log = FoodLog.query.get_or_404(log_id)
    db.session.delete(log)
    db.session.commit()
    return '', 204
