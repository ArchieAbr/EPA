import json
import os 
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}) # Allows frontend to talk to this server
DB_FILE = 'database.geojson'
WORK_ORDERS_FILE = 'work_orders.json'


# ==================== WORK ORDER ENDPOINTS ====================

@app.route('/api/workorders', methods=['GET'])
def get_work_orders():
    """
    Get list of all work orders (summary view).
    Returns: Array of work orders without full design_assets (for list display).
    """
    if not os.path.exists(WORK_ORDERS_FILE):
        return jsonify([])
    
    with open(WORK_ORDERS_FILE, 'r') as f:
        data = json.load(f)
    
    # Return summary (exclude design_assets for list view)
    summaries = []
    for wo in data.get('work_orders', []):
        summaries.append({
            'id': wo['id'],
            'reference': wo['reference'],
            'name': wo['name'],
            'description': wo['description'],
            'status': wo['status'],
            'priority': wo['priority'],
            'assigned_to': wo['assigned_to'],
            'assigned_date': wo['assigned_date'],
            'due_date': wo['due_date'],
            'asset_count': len(wo.get('design_assets', [])),
            'bounds': wo['bounds']
        })
    
    return jsonify(summaries)


@app.route('/api/workorders/<wo_id>', methods=['GET'])
def get_work_order(wo_id):
    """
    Get a single work order by ID (full details including design_assets).
    This is the "job pack download" endpoint.
    """
    if not os.path.exists(WORK_ORDERS_FILE):
        return jsonify({'error': 'Work orders file not found'}), 404
    
    with open(WORK_ORDERS_FILE, 'r') as f:
        data = json.load(f)
    
    for wo in data.get('work_orders', []):
        if wo['id'] == wo_id:
            return jsonify(wo)
    
    return jsonify({'error': 'Work order not found'}), 404


# ==================== EXISTING ASSET ENDPOINTS ====================

# Route 1: Get all assets (this simulates getting a job pack)
@app.route('/api/assets', methods=['GET'])
def get_assets():
    if not os.path.exists(DB_FILE):
        return jsonify({"features": []})
    with open(DB_FILE, 'r') as f:
        data = json.load(f)
    return jsonify(data)

# Route 2: Sync offline changes (Simulates returning to office)
@app.route('/api/sync', methods=['POST'])
def sync_changes():
    new_features = request.json

    # Read current DB
    with open(DB_FILE, 'r') as f:
        db_data = json.load(f)

    # Simple Append Logic (For PoC)
    for feature in new_features:
        db_data['features'].append(feature)

    # Save back to file
    with open(DB_FILE, 'w') as f:
        json.dump(db_data, f, indent=2)

    return jsonify({"status": "success", "message": "Synced successfully!"})

if __name__ == '__main__':
    app.run(debug=True, port=5000)