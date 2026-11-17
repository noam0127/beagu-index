#!/usr/bin/env python3
"""Aggregate 2025 official household-level housing assessed prices by Sejong legal dong.

Usage:
 python3 scripts/sejong-2025-housing-mean.py \
 --source '/path/to/2025_molit_housing.zip' \
 --school-map data/sejong-school-legal-dong-2025.csv \
 --output /tmp/sejong-2025-housing-mean.csv

Official source: https://www.data.go.kr/data/3073746/fileData.do
Output is NOT automatically published or written into Supabase.
"""
import argparse
import csv
import io
import re
import zipfile
from collections import defaultdict
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

CODE_FIELDS = ('법정동코드', '법정동 코드', '법정동_코드')
PRICE_FIELDS = ('공시가격', '공동주택가격', '공시가격(원)', '공동주택가격(원)')


def field(headers, explicit, candidates):
    if explicit:
        if explicit not in headers:
            raise ValueError(f'Missing specified column {explicit}; found {headers}')
        return explicit
    for name in candidates:
        if name in headers:
            return name
    raise ValueError(f'Missing required column (one of {candidates}); found {headers}')


def open_source(path):
    if path.suffix.lower() != '.zip':
        return None, path.open('r', encoding='utf-8-sig', newline='')
    archive = zipfile.ZipFile(path)
    csvs = [i for i in archive.infolist() if not i.is_dir()
            and i.filename.lower().endswith('.csv') and '샘플' not in i.filename
            and 'sample' not in i.filename.lower()]
    if not csvs:
        raise ValueError('Official ZIP does not contain a full-size CSV file')
    full = max(csvs, key=lambda i: i.file_size)
    return archive, io.TextIOWrapper(archive.open(full), encoding='utf-8-sig', newline='')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', required=True, type=Path)
    p.add_argument('--school-map', required=True, type=Path)
    p.add_argument('--output', required=True, type=Path)
    p.add_argument('--dong-column')
    p.add_argument('--price-column')
    args = p.parse_args()

    with args.school_map.open('r', encoding='utf-8-sig', newline='') as stream:
        schools = list(csv.DictReader(stream))
    codes = {r['legal_dong_code'] for r in schools}
    if len(schools) != 55 or len({r['school_id'] for r in schools}) != 55:
        raise ValueError('School ID mapping must be exactly 55 unique schools')
    if len(codes) != 35 or any(not re.fullmatch(r'36\d{8}', x) for x in codes):
        raise ValueError('Expected 35 validated 10-digit Sejong legal-dong codes')

    aggregate = defaultdict(lambda: [Decimal(0), 0])
    archive, stream = open_source(args.source)
    rows = 0
    bad = 0
    try:
        reader = csv.DictReader(stream)
        headers = reader.fieldnames or []
        code_col = field(headers, args.dong_column, CODE_FIELDS)
        price_col = field(headers, args.price_column, PRICE_FIELDS)
        year_col = next((x for x in ('기준연도', '공시연도') if x in headers), None)
        for row in reader:
            rows += 1
            code = (row.get(code_col) or '').strip()
            if code not in codes:
                continue
            if year_col and (row.get(year_col) or '').strip() != '2025':
                raise ValueError('Source contains a non-2025 record for a Sejong legal dong')
            amount = (row.get(price_col) or '').replace(',', '').replace('원', '').strip()
            try:
                price = Decimal(amount)
            except InvalidOperation:
                bad += 1
                continue
            if not price.is_finite() or price <= 0:
                bad += 1
                continue
            aggregate[code][0] += price
            aggregate[code][1] += 1
    finally:
        stream.close()
        if archive is not None:
            archive.close()

    if rows < 1000:
        raise ValueError('Input looks like a sample rather than the complete 2025 housing CSV')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.writer(stream)
        writer.writerow(['school_id', 'school_name', 'legal_dong_code',
                         'housing_units', 'mean_housing_price_won',
                         'reference_year', 'mapping_source_row'])
        for school in sorted(schools, key=lambda r: r['school_name']):
            code = school['legal_dong_code']
            total, count = aggregate[code]
            mean = str((total / count).quantize(Decimal(1), rounding=ROUND_HALF_UP)) if count else ''
            writer.writerow([school['school_id'], school['school_name'], code,
                             count if count else '', mean, 2025, school['source_row']])
    with_value = sum(bool(aggregate[x['legal_dong_code']][1]) for x in schools)
    print(f'Processed {rows:,} housing records; {with_value}/55 schools with verified price; '
          f'{55-with_value}/55 no housing price data; {bad} invalid price records.')
    print('Do not publish before validating original source, count and method:', args.output)


if __name__ == '__main__':
    main()
