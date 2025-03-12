import gradio as gr
from firebase_handler import upload_file_to_storage


def file_handler(file):
    print(file)
    upload_file_to_storage(file)

    return file


with gr.Blocks() as demo:
    files = gr.Files(label="Upload your files here")
    up = gr.UploadButton(file_count="multiple", type="filepath")
    up.upload(file_handler, outputs=files, inputs=up)


demo.launch()
