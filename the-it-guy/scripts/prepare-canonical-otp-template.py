#!/usr/bin/env python3
import argparse
import copy
import hashlib
import json
import os
import re
import zipfile
from pathlib import Path

from lxml import etree

W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
XML_NS = 'http://www.w3.org/XML/1998/namespace'
NS = {'w': W_NS}


def qn(local_name):
    return f'{{{W_NS}}}{local_name}'


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def paragraph_text(paragraph):
    return ''.join(paragraph.xpath('.//w:t/text()', namespaces=NS)).strip()


def logical_cell(table, row_index, grid_column):
    rows = table.xpath('./w:tr', namespaces=NS)
    if row_index >= len(rows):
        raise IndexError(f'row {row_index} does not exist')
    current_grid = 0
    for cell in rows[row_index].xpath('./w:tc', namespaces=NS):
        spans = cell.xpath('./w:tcPr/w:gridSpan/@w:val', namespaces=NS)
        span = int(spans[0]) if spans else 1
        if current_grid <= grid_column < current_grid + span:
            return cell
        current_grid += span
    raise IndexError(f'logical grid column {grid_column} does not exist')


def ensure_text_node(container):
    text_nodes = container.xpath('.//w:t', namespaces=NS)
    if text_nodes:
        return text_nodes[0]
    paragraphs = container.xpath('./w:p', namespaces=NS)
    if not paragraphs:
        paragraph = etree.SubElement(container, qn('p'))
    else:
        paragraph = paragraphs[0]
    runs = paragraph.xpath('./w:r', namespaces=NS)
    if runs:
        run = runs[-1]
    else:
        run = etree.SubElement(paragraph, qn('r'))
    return etree.SubElement(run, qn('t'))


def set_container_text(container, value, mode):
    text_nodes = container.xpath('.//w:t', namespaces=NS)
    if mode == 'append' and text_nodes:
        target = text_nodes[-1]
        separator = ' ' if (target.text or '').strip() else ''
        target.text = f'{target.text or ""}{separator}{value}'
        target.set(f'{{{XML_NS}}}space', 'preserve')
        return
    target = ensure_text_node(container)
    target.text = value
    target.set(f'{{{XML_NS}}}space', 'preserve')
    for extra in container.xpath('.//w:t', namespaces=NS):
        if extra is not target:
            extra.text = ''


def patch_document_xml(xml_bytes, manifest):
    parser = etree.XMLParser(remove_blank_text=False)
    root = etree.fromstring(xml_bytes, parser)
    tables = root.xpath('//w:body/w:tbl', namespaces=NS)
    applied = []
    for field in manifest['fields']:
        for slot in field['slots']:
            token = slot['token']
            value = f'{{{token}}}'
            locator = slot['locator']
            if locator['type'] == 'table_cell':
                table_index = int(locator['tableIndex'])
                if table_index >= len(tables):
                    raise IndexError(f'table {table_index} does not exist for {token}')
                container = logical_cell(
                    tables[table_index],
                    int(locator['rowIndex']),
                    int(locator['gridColumn']),
                )
                set_container_text(container, value, slot.get('mode', 'set'))
            elif locator['type'] == 'paragraph_text_append':
                matches = [
                    paragraph for paragraph in root.xpath('//w:p', namespaces=NS)
                    if paragraph_text(paragraph) == locator['labelText']
                ]
                if len(matches) != 1:
                    raise ValueError(f'expected one paragraph labelled {locator["labelText"]!r}, found {len(matches)}')
                set_container_text(matches[0], value, 'append')
            else:
                raise ValueError(f'unsupported locator type {locator["type"]}')
            applied.append(token)
    return etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone='yes'), applied


def write_patched_package(source_path, output_path, document_xml):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source_path, 'r') as source, zipfile.ZipFile(output_path, 'w') as output:
        for info in source.infolist():
            data = document_xml if info.filename == 'word/document.xml' else source.read(info.filename)
            cloned = copy.copy(info)
            output.writestr(cloned, data)


def render_sample(template_path, sample_path, manifest):
    replacements = {
        f'{{{slot["token"]}}}': str(slot.get('sample') or '')
        for field in manifest['fields']
        for slot in field['slots']
    }
    with zipfile.ZipFile(template_path, 'r') as source:
        xml = source.read('word/document.xml').decode('utf-8')
    for token, value in replacements.items():
        xml = xml.replace(token, value)
    unresolved = sorted(set(re.findall(r'\{[a-z][a-z0-9_]*\}', xml)))
    if unresolved:
        raise ValueError(f'unresolved sample tokens: {unresolved}')
    write_patched_package(template_path, sample_path, xml.encode('utf-8'))


def verify_preserved_parts(source_path, output_path):
    with zipfile.ZipFile(source_path, 'r') as source, zipfile.ZipFile(output_path, 'r') as output:
        source_names = set(source.namelist())
        output_names = set(output.namelist())
        if source_names != output_names:
            raise ValueError('DOCX package part list changed')
        changed = [
            name for name in sorted(source_names)
            if name != 'word/document.xml' and source.read(name) != output.read(name)
        ]
        if changed:
            raise ValueError(f'preserve-only package parts changed: {changed}')


def fixed_legal_paragraphs(xml_bytes):
    root = etree.fromstring(xml_bytes)
    paragraphs = root.xpath('/w:document/w:body/w:p', namespaces=NS)
    texts = [''.join(paragraph.xpath('.//w:t/text()', namespaces=NS)) for paragraph in paragraphs]
    try:
        legal_start = texts.index('TABLE OF CONTENTS')
    except ValueError as error:
        raise ValueError('fixed OTP legal core marker was not found') from error
    return texts[legal_start:]


def verify_fixed_legal_core(source_path, output_path):
    with zipfile.ZipFile(source_path, 'r') as source, zipfile.ZipFile(output_path, 'r') as output:
        source_core = fixed_legal_paragraphs(source.read('word/document.xml'))
        output_core = fixed_legal_paragraphs(output.read('word/document.xml'))
    if source_core != output_core:
        raise ValueError('fixed OTP legal paragraphs changed during canonical template preparation')


def main():
    parser = argparse.ArgumentParser(description='Prepare the Kingstons 2026 OTP as a canonical Docxtemplater DOCX.')
    parser.add_argument('--source', required=True)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--sample-output')
    args = parser.parse_args()

    source_path = Path(args.source).resolve()
    manifest_path = Path(args.manifest).resolve()
    output_path = Path(args.output).resolve()
    manifest = json.loads(manifest_path.read_text())
    actual_hash = sha256(source_path)
    if actual_hash != manifest['sourceSha256']:
        raise ValueError(f'source hash mismatch: expected {manifest["sourceSha256"]}, received {actual_hash}')

    with zipfile.ZipFile(source_path, 'r') as source:
        patched_xml, applied = patch_document_xml(source.read('word/document.xml'), manifest)
    write_patched_package(source_path, output_path, patched_xml)
    verify_preserved_parts(source_path, output_path)
    verify_fixed_legal_core(source_path, output_path)

    if args.sample_output:
        sample_path = Path(args.sample_output).resolve()
        render_sample(output_path, sample_path, manifest)
        verify_preserved_parts(source_path, sample_path)
        verify_fixed_legal_core(source_path, sample_path)

    result = {
        'source': str(source_path),
        'sourceSha256': actual_hash,
        'output': str(output_path),
        'outputSha256': sha256(output_path),
        'slotCount': len(applied),
        'uniqueTokenCount': len(set(applied)),
        'sampleOutput': str(Path(args.sample_output).resolve()) if args.sample_output else None,
    }
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
