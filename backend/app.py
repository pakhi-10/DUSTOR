from flask import Flask, request, jsonify
from flask_mysqldb import MySQL
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_cors import CORS
import bcrypt
from config import Config

app = Flask(__name__)
app.config.from_object(Config)

CORS(app)
mysql = MySQL(app)
jwt = JWTManager(app)


# SIGNUP

@app.route('/signup', methods=['POST'])
def signup():
    data = request.get_json()
    name     = data.get('name')
    email    = data.get('email')
    password = data.get('password')

    if not all([name, email, password]):
        return jsonify({"error": "All fields are required"}), 400

    hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())

    cur = mysql.connection.cursor()
    try:
        cur.execute(
            "INSERT INTO users (name, email, password) VALUES (%s, %s, %s)",
            (name, email, hashed.decode('utf-8'))
        )
        mysql.connection.commit()
        return jsonify({"message": "User created successfully"}), 201
    except Exception as e:
        return jsonify({"error": "Email already exists"}), 409
    finally:
        cur.close()


# ──────────────────────────────────────────────
# LOGIN
# ──────────────────────────────────────────────
@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    email    = data.get('email')
    password = data.get('password')

    cur = mysql.connection.cursor()
    cur.execute("SELECT id, name, password FROM users WHERE email = %s", (email,))
    user = cur.fetchone()
    cur.close()

    if not user:
        return jsonify({"error": "Invalid credentials"}), 401

    user_id, name, hashed_pw = user

    if bcrypt.checkpw(password.encode('utf-8'), hashed_pw.encode('utf-8')):
        token = create_access_token(identity=str(user_id))
        return jsonify({"token": token, "name": name, "user_id": user_id}), 200
    else:
        return jsonify({"error": "Invalid credentials"}), 401


# ──────────────────────────────────────────────
# PROTECTED ROUTE (example)
# ──────────────────────────────────────────────
@app.route('/profile', methods=['GET'])
@jwt_required()
def profile():
    user_id = get_jwt_identity()
    cur = mysql.connection.cursor()
    cur.execute("SELECT id, name, email FROM users WHERE id = %s", (user_id,))
    user = cur.fetchone()
    cur.close()
    return jsonify({"id": user[0], "name": user[1], "email": user[2]}), 200


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)