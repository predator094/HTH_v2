import streamlit as st
import firebase_admin
from firebase_admin import credentials, storage, firestore
import random
import string
import hashlib
import datetime
import mimetypes  # Import the mimetypes module
import os
import requests
import io
import base64
import asyncio
import pytz
import json

st.set_page_config(
    page_title="H2H File Sharing",
    page_icon="🙏",
    layout="wide",
    initial_sidebar_state="expanded",
)


# Initialize Firebase Admin SDK
if not firebase_admin._apps:
    key_dict = json.loads(st.secrets["textkey"])
    # Use credentials.Certificate instead of Credentials.from_service_account_info
    cred = credentials.Certificate(key_dict)
    firebase_admin.initialize_app(
        cred, {"storageBucket": "hth-project-10dec.appspot.com"}
    )

# Reference to the default storage bucket
bucket = storage.bucket("hth-project-10dec.appspot.com")
# Reference to Firestore database
db = firestore.client()


def generate_password_and_folder_name():

    # Generate a random password of length 16
    password = "".join(random.choices(string.digits, k=6))
    # Use MD5 hash function to generate a hash
    hashed_pass = hashlib.md5(password.encode()).hexdigest()

    # Clean the hash value to make it a valid folder name
    cleaned_hash = "".join(
        c if c.isalnum() or c in ("_", "-") else "_" for c in hashed_pass
    )

    # Use the cleaned hash value as a folder name
    folder_name = f"folder_{cleaned_hash}"

    return password, folder_name


tab1, tab2 = st.tabs(["Upload", "Download"])


# Upload files to the bucket
def upload_folder_to_firestore(folder_name):
    # Add folder entry to Firestore
    current_time = datetime.datetime.now(pytz.utc)
    doc_ref = db.collection("folders").document(folder_name)
    doc_ref.set(
        {
            "upload_time": current_time,
        }
    )


with tab1:
    # file upload on streamlit
    uploaded_file = st.file_uploader("Choose a file", accept_multiple_files=True)
    if uploaded_file is not None:
        if st.button("Upload"):
            password, folder_name = generate_password_and_folder_name()
            for file in uploaded_file:
                # Upload each file to the bucket
                st.write(f"Uploaded file {file.name}")
                st.divider()
                upload_folder_to_firestore(folder_name)
                # Get the file extension
                mime_type = file.type
                # mime_type, _ = mimetypes.guess_type(file.name)

                blob = bucket.blob(f"{folder_name}/{file.name}")
                blob.upload_from_file(file, content_type=mime_type)

            st.write("File uploaded successfully")
            st.write(f"You can access the file using the password")
            st.code(password)


async def download_file_async(url, filename, mime_type, progress_bar):
    st.markdown(f"### Downloading {filename}")
    response = requests.get(url, stream=True)
    total_size = int(response.headers.get("content-length", 0))
    bytes_so_far = 0

    with io.BytesIO() as buffer:
        for chunk in response.iter_content(chunk_size=1024):
            if chunk:
                buffer.write(chunk)
                bytes_so_far += len(chunk)
                progress = bytes_so_far / total_size
                progress_bar.progress(progress)
        download_button = f'<a download="{filename}" href="data:application/octet-stream;base64,{base64.b64encode(buffer.getvalue()).decode()}" target="_blank">Click here to Download {filename}</a>'
        st.markdown(download_button, unsafe_allow_html=True)

    progress_bar.empty()


@st.cache(suppress_st_warning=True)
def download_files_simultaneously_cached(password):
    loop = asyncio.get_event_loop()
    loop.run_until_complete(download_files_simultaneously(password))


async def download_files_simultaneously(password):
    tasks = []
    for i, file_info in enumerate(st.session_state.file_info_list):
        download_url = file_info["download_url"]
        filename = file_info["file_name"]
        mime_type = file_info["mime_type"]
        progress_bar = st.progress(0)
        task = asyncio.create_task(
            download_file_async(download_url, filename, mime_type, progress_bar)
        )
        tasks.append(task)
    await asyncio.gather(*tasks)
    st.success("Downloads complete!")


if "clicked" not in st.session_state:
    st.session_state.clicked = [False]
if "file_info_list" not in st.session_state:
    st.session_state.file_info_list = []
if "password" not in st.session_state:
    st.session_state.password = None


def clicked(num):
    st.session_state.clicked[num] = (
        True if st.session_state.clicked[num] == False else False
    )


with tab2:
    st.header("Download a file")
    try:
        while password := st.text_input("Enter the password"):
            if password:
                if st.session_state.password != password:
                    st.session_state.clicked[0] = False
                    st.session_state.password = password
                st.session_state.file_info_list = []
                # Use MD5 hash function to generate a hash
                hashed_pass = hashlib.md5(password.encode()).hexdigest()

                # Clean the hash value to make it a valid folder name
                cleaned_hash = "".join(
                    c if c.isalnum() or c in ("_", "-") else "_" for c in hashed_pass
                )

                # Use the cleaned hash value as a folder name
                folder_name = f"folder_{cleaned_hash}"

                # Get all the files in the folder
                files = list(bucket.list_blobs(prefix=folder_name))

                # If there are no files in the folder, then the password is invalid
                if not files:
                    st.write("Invalid password")
                    continue

                # getting all th files in the folder
                for file in files:
                    st.session_state.file_info_list.append(
                        {
                            "download_url": file.generate_signed_url(
                                version="v4",
                                expiration=datetime.timedelta(minutes=15),
                                method="GET",
                                response_disposition=f"attachment; filename={file.name}",
                                response_type="application/octet-stream",
                            ),
                            "file_name": file.name.replace(folder_name + "/", ""),
                            "mime_type": mimetypes.guess_type(file.name)[0],
                        },
                    )
                # content_type = metadata.get("contentType")
                st.subheader("Files in the folder")
                st.write(
                    [info["file_name"] for info in st.session_state.file_info_list]
                )

            if (
                st.button(
                    "Download Files Simultaneously",
                    key="download-files",
                    on_click=clicked,
                    args=[0],
                )
                or st.session_state.clicked[0] == True
            ):
                asyncio.run(download_files_simultaneously(hashed_pass))
    except Exception as e:
        pass


# Delete files after 24 hours of upload
def delete_old_files():
    # Get all folders from Firestore
    folders_ref = db.collection("folders")
    folders = folders_ref.stream()

    # Get current time
    current_time = datetime.datetime.now(pytz.utc)
    print(f"Current time: {current_time}")
    # Iterate through folders
    for folder in folders:
        if folder.id == "folder_name":
            continue
        # Check if more than 24 hours have passed since upload
        time_difference = current_time - folder.get("upload_time")
        print(f"Time difference: {time_difference.total_seconds()}")
        if time_difference.total_seconds() > 60:
            print(f"Deleting old folder: {folder.id}")

            # Delete folder entry from Firestore
            doc_ref = folders_ref.document(folder.id)
            doc_ref.delete()

            # Delete corresponding files in Firebase Storage
            blobs = list(bucket.list_blobs(prefix=folder.id))
            for blob in blobs:
                blob.delete()


delete_old_files()
