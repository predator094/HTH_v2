import firebase_admin
from firebase_admin import credentials, storage, firestore
import json
import datetime
import mimetypes
import pytz
import yaml
from utils import generate_password_and_folder_name
import os
import tempfile
import threading
import time

config = yaml.safe_load(open("config.yaml"))

# Initialize Firebase Admin SDK
if not firebase_admin._apps:
    key_dict = json.loads(config["textkey"])
    # Use credentials.Certificate instead of Credentials.from_service_account_info
    cred = credentials.Certificate(key_dict)
    firebase_admin.initialize_app(
        cred, {"storageBucket": "hth-project-10dec.appspot.com"}
    )

# Reference to the default storage bucket
bucket = storage.bucket("hth-project-10dec.appspot.com")
# Reference to Firestore database
db = firestore.client()


def upload_folder_to_firestore(folder_name):
    # Add folder entry to Firestore
    current_time = datetime.datetime.now(pytz.utc)
    doc_ref = db.collection("folders").document(folder_name)
    doc_ref.set(
        {
            "upload_time": current_time,
        }
    )


def upload_file_to_storage(files):
    try:
        password, folder_name = generate_password_and_folder_name()
        for f in files:
            file = open(f, "rb")
            file_name = os.path.basename(file.name)
            mime_type, _ = mimetypes.guess_type(file_name)
            upload_folder_to_firestore(folder_name)
            blob = bucket.blob(f"{folder_name}/{file_name}")
            print(f"Uploading {file_name} to {folder_name}")
            blob.upload_from_file(file, content_type=mime_type)
            return password
    except Exception as e:
        print(e)
        return "Error occurred while uploading the file"


# Global persistent temp directory
PERSISTENT_TEMP_DIR = tempfile.mkdtemp()

# Time threshold (in seconds) before files are deleted (e.g., 3 hours)
EXPIRATION_TIME = 3 * 60 * 60  # 3 hours


def cleanup_temp_files():
    """Deletes temp files older than EXPIRATION_TIME (runs in the background)."""
    while True:
        now = time.time()
        for file in os.listdir(PERSISTENT_TEMP_DIR):
            file_path = os.path.join(PERSISTENT_TEMP_DIR, file)
            if (
                os.path.isfile(file_path)
                and os.stat(file_path).st_mtime < now - EXPIRATION_TIME
            ):
                os.remove(file_path)
                print(f"Deleted old file: {file_path}")
        time.sleep(1800)  # Run cleanup every 30 minutes


# Start cleanup in a background thread
threading.Thread(target=cleanup_temp_files, daemon=True).start()


def download_file(passowrd):
    try:
        folder_name = generate_password_and_folder_name(passowrd)
        files = list(bucket.list_blobs(prefix=folder_name))
        file_paths = []
        for file in files:
            blob = bucket.blob(file.name)
            temp_file_path = os.path.join(
                PERSISTENT_TEMP_DIR, os.path.basename(file.name)
            )
            blob.download_to_filename(temp_file_path)
            # Download the file to temp storage
            file_paths.append(temp_file_path)
        return file_paths

    except Exception as e:
        print(e)
        return "Error occurred while downloading the file"
