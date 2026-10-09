import os
from flask import Flask, jsonify, render_template


app = Flask(__name__)


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/api/config")
def config():
    return jsonify(
        contractAddress=os.environ.get("CONTRACT_ADDRESS", "").strip(),
        deploymentBlock=os.environ.get("DEPLOYMENT_BLOCK", "").strip(),
        chainId=11155111,
    )


if __name__ == "__main__":
    app.run(debug=False)
