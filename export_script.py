import os
import re
import xml.etree.ElementTree as ET

# XMLファイルを読み込む
file_path = './dev_count_k_ui_fmp12.xml'
tree = ET.parse(file_path)
root = tree.getroot()

# エスケープ処理関数
def escape_filename(name):
    return name.replace('/', '_').replace('\\', '_')

def remove_script_comments(text):
    if not text:
        return ''
    no_block_comments = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
    cleaned_lines = []
    for line in no_block_comments.splitlines():
        line_without_line_comment = re.sub(r'//.*', '', line)
        if line_without_line_comment.strip():
            cleaned_lines.append(line_without_line_comment.rstrip())
    return '\n'.join(cleaned_lines)

# 再帰的にディレクトリを作成し、スクリプトを書き出す関数
def process_group(group, base_path):
    group_name = escape_filename(group.attrib.get('name', 'UnnamedGroup'))
    group_path = os.path.join(base_path, group_name)
    os.makedirs(group_path, exist_ok=True)
    
    for child in group:
        if child.tag == 'Group':
            process_group(child, group_path)
        elif child.tag == 'Script':
            script_name = escape_filename(child.attrib.get('name', 'UnnamedScript'))
            script_path = os.path.join(group_path, f"{script_name}.txt")
            with open(script_path, 'w', encoding='utf-8') as script_file:
                indent_level = 0
                indent_unit = '    '
                start_steps = {'Loop', 'If'}
                end_steps = {'End Loop', 'End If'}
                middle_steps = {'Else', 'Else If'}

                for step in child.iter('Step'):
                    if step.attrib.get('enable') == 'False':
                        continue
                    step_text = step.find('StepText')
                    if step_text is None or step_text.text is None:
                        continue

                    step_name = step.attrib.get('name', '')
                    if step_name == '# (コメント)':
                        continue
                    if step_name in end_steps or step_name in middle_steps:
                        indent_level = max(indent_level - 1, 0)

                    clean_text = remove_script_comments(step_text.text)
                    if not clean_text:
                        continue
                    for line in clean_text.splitlines():
                        script_file.write(f"{indent_unit * indent_level}{line}\n")

                    if step_name in start_steps or step_name in middle_steps:
                        indent_level += 1

# 処理の開始ポイント
script_catalog = root.find('.//ScriptCatalog')
if script_catalog is not None:
    base_directory = './ScriptCatalog'
    os.makedirs(base_directory, exist_ok=True)
    process_group(script_catalog, base_directory)
else:
    print("XML内にScriptCatalogが見つかりませんでした。")

# 確認のため、作成されたディレクトリとファイルの一覧を表示
import subprocess
output = subprocess.run(['ls', '-R', './ScriptCatalog'], check=True, capture_output=True, text=True)
print(output.stdout)