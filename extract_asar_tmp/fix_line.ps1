$path = "e:\AIEnglish\SmartLearnPro\src\views\ExamView.jsx"
$content = Get-Content $path -Encoding UTF8
$content[831] = '            toast.success(`已加入闪卡：${added}，跳过重复：${skipped}`);'
$content | Set-Content $path -Encoding UTF8
