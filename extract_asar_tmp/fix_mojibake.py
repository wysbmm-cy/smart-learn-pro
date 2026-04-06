import re
import os

path = r'e:\AIEnglish\SmartLearnPro\src\views\ExamView.jsx'

with open(path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# Fix "原版头部"
content = re.sub(r'鍘熺増澶撮儴', '原版头部', content)

# Fix problematic toast
# Looking for the pattern around line 832
pattern = r'toast\.success\(`[^`]*\$\{added\}[^`]*\$\{skipped\}`\);'
replacement = 'toast.success(`已加入闪卡：${added}，跳过重复：${skipped}`);'

# Let's see if we find it first
matches = re.findall(pattern, content)
print(f"Found {len(matches)} matches for the toast pattern.")

if len(matches) > 0:
    content = re.sub(pattern, replacement, content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Replacement done.")
