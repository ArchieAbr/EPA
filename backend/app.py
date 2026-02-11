import json
import os 
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}) # Allows frontend to talk to this server
DB_FILE = 'database.geojson'

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