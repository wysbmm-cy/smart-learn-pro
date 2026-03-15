import os

# Using the extended-length path prefix to bypass Win32 name restrictions
src = r"\\?\e:\AIEnglish\SmartLearnPro\android\nul"
dst = r"\\?\e:\AIEnglish\SmartLearnPro\android\null_file_backup"

try:
    if os.path.exists(src):
        os.rename(src, dst)
        print(f"Successfully renamed {src} to {dst}")
    else:
        print(f"Source file {src} not found.")
except Exception as e:
    print(f"Error occurred: {e}")
