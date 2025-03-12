import gradio as gr
from firebase_handler import upload_file_to_storage, download_file

theme = gr.themes.Ocean(
    text_size="lg",
    spacing_size="lg",
).set(
    body_text_weight="500",
    embed_radius="*radius_lg",
    prose_text_weight="500",
    prose_header_text_weight="800",
)


def upload_file(file):
    if len(file) == 0:
        gr.Warning("Please upload a file")
        return "Please upload a file"
    password = upload_file_to_storage(file)
    gr.Info(f"Uploaded {len(file)   }")
    return int(password)


def download(password):
    if len(password) < 6:
        gr.Warning("Please enter a valid password")
        return
    files = download_file(password)

    return files


up_file = gr.Files(label="Upload your files here")
# up_button = gr.Button(value="Upload", variant="primary")
passw = gr.Textbox(label="Password", placeholder="Your password will appear here")
upload_tab = gr.Interface(
    fn=upload_file, inputs=[up_file], outputs=[passw], title="Upload a File"
)
download_tab = gr.Interface(
    fn=download, inputs="text", outputs=["file"], title="Download a File"
)

demo = gr.TabbedInterface(
    [upload_tab, download_tab], ["Upload", "Download"], theme=theme
)

if __name__ == "__main__":
    demo.launch()
