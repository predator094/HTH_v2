import random
import string
import hashlib


def generate_password_and_folder_name(password=None):
    if not password:
        # Generate a random password of length 16
        gen_password = "".join(random.choices(string.digits, k=6))
    else:
        gen_password = password

    # Use MD5 hash function to generate a hash
    hashed_pass = hashlib.md5(gen_password.encode()).hexdigest()

    # Clean the hash value to make it a valid folder name
    cleaned_hash = "".join(
        c if c.isalnum() or c in ("_", "-") else "_" for c in hashed_pass
    )

    # Use the cleaned hash value as a folder name
    folder_name = f"folder_{cleaned_hash}"

    return (gen_password, folder_name) if not password else (folder_name)
