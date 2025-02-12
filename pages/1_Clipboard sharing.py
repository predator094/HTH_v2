import streamlit as st
import firebase_admin
from firebase_admin import credentials, firestore
import random
import string
import json
import datetime


st.set_page_config(
    page_title="H2H File Sharing",
    page_icon="😎📝",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Initialize Firebase Admin SDK
if not firebase_admin._apps:
    key_dict = json.loads(st.secrets["textkey"])
    cred = credentials.Certificate(key_dict)
    firebase_admin.initialize_app(cred)

# Firestore Database Reference
db = firestore.client()


def generate_six_digit_code():
    """Generates a random 6-digit code."""
    return "".join(random.choices(string.digits, k=3))


def delete_expired_entries():
    """Deletes text entries older than 24 hours."""
    now = datetime.datetime.now(datetime.timezone.utc)  # Updated to timezone-aware UTC
    cutoff_time = now - datetime.timedelta(hours=24)

    docs = db.collection("clipboard").stream()
    for doc in docs:
        doc_data = doc.to_dict()
        if "timestamp" in doc_data:
            entry_time = doc_data["timestamp"]
            if entry_time < cutoff_time:
                db.collection("clipboard").document(doc.id).delete()


tab1, tab2 = st.tabs(["Share Text", "Retrieve Text"])

# **Tab 1: Share Text**
with tab1:
    st.header("Share Text Instantly")
    user_text = st.text_area("Enter your text here:")

    if st.button("Generate Shareable Code"):
        if user_text.strip():
            unique_code = generate_six_digit_code()
            timestamp = datetime.datetime.now(
                datetime.timezone.utc
            )  # Updated to timezone-aware UTC
            db.collection("clipboard").document(unique_code).set(
                {"text": user_text, "timestamp": timestamp}
            )
            st.success(f"Your text is saved! Use this code to share: `{unique_code}`")
            st.code(unique_code)
        else:
            st.warning("Please enter some text before generating a code.")

# **Tab 2: Retrieve Text**
with tab2:
    st.header("Retrieve Shared Text")
    retrieve_code = st.text_input("Enter the 6-digit code:")

    if st.button("Fetch Text"):
        delete_expired_entries()  # Clean up expired entries before fetching
        doc_ref = db.collection("clipboard").document(retrieve_code)
        doc = doc_ref.get()

        if doc.exists:
            shared_text = doc.to_dict()["text"]
            st.success("Here is the shared text:")
            st.code(shared_text)
        else:
            st.error("Invalid code or expired text!")
