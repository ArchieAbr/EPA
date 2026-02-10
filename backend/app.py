import json
import os 
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app) # Allows frontend to talk to this server

DB_FILE = 'database.geojson'

# Route 1: Get all assets (this simulates getting a job pack)