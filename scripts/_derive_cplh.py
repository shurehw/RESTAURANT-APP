import urllib.request, json, math, os
from dotenv import load_dotenv
load_dotenv('.env.local')
os.environ['PYTHONIOENCODING'] = 'utf-8'

url = os.environ['NEXT_PUBLIC_SUPABASE_URL']
key = os.environ['SUPABASE_SERVICE_ROLE_KEY']

PEAK_PCT = 0.22

INDUSTRY = {
    'Server': 18, 'Bartender': 30, 'Busser': 35, 'Food Runner': 30,
    'Host': None, 'Line Cook': 22, 'Prep Cook': 50, 'Dishwasher': None,
    'Sous Chef': None, 'Executive Chef': None, 'General Manager': None,
    'Assistant Manager': None, 'Shift Manager': 100,
}

def query(path):
    req = urllib.request.Request(f"{url}/rest/v1/{path}", headers={
        "apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"
    })
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

venues = [
    ("11111111-1111-1111-1111-111111111111", "Delilah LA"),
    ("288b7f22-ffdc-4701-a396-a6b415aff0f1", "Delilah Miami"),
]

all_venue_cplh = {}

for vid, vname in venues:
    print(f"\n{'='*80}")
    print(f"  {vname} - Deriving Per-Position Peak-Hour CPLH")
    print(f"{'='*80}")

    emps = query(f"employees?venue_id=eq.{vid}&employment_status=eq.active&select=id,primary_position_id")
    pos_list = query(f"positions?venue_id=eq.{vid}&is_active=eq.true&select=id,name,category,base_hourly_rate")
    id_to_pos = {p['id']: p for p in pos_list}

    pos_counts = {}
    foh_positions = set()
    boh_positions = set()
    mgmt_positions = set()
    for e in emps:
        p = id_to_pos.get(e['primary_position_id'])
        if not p:
            continue
        pos_counts[p['name']] = pos_counts.get(p['name'], 0) + 1
        if p['category'] == 'front_of_house':
            foh_positions.add(p['name'])
        elif p['category'] == 'back_of_house':
            boh_positions.add(p['name'])
        else:
            mgmt_positions.add(p['name'])

    foh_total = sum(pos_counts.get(p, 0) for p in foh_positions)
    boh_total = sum(pos_counts.get(p, 0) for p in boh_positions)

    print(f"\n  Pool: {sum(pos_counts.values())} employees")
    print(f"  FOH ({foh_total}): {', '.join(f'{p}={pos_counts.get(p,0)}' for p in sorted(foh_positions))}")
    print(f"  BOH ({boh_total}): {', '.join(f'{p}={pos_counts.get(p,0)}' for p in sorted(boh_positions))}")
    print(f"  Mgmt: {', '.join(f'{p}={pos_counts.get(p,0)}' for p in sorted(mgmt_positions))}")

    # Get busy-day labor data (covers > 200)
    labor = query(f"labor_day_facts?venue_id=eq.{vid}&covers=gt.200&select=business_date,covers,total_hours,foh_hours,boh_hours,other_hours,foh_employee_count,boh_employee_count,employee_count&order=business_date.desc&limit=50")

    print(f"\n  Busy service days (200+ covers): {len(labor)}")

    position_stats = {}

    for day in labor:
        covers = day['covers']
        foh_h = day['foh_hours'] or 0
        boh_h = day['boh_hours'] or 0
        foh_emp = day['foh_employee_count'] or 0
        boh_emp = day['boh_employee_count'] or 0

        if foh_h < 10 or boh_h < 5:
            continue

        foh_avg_shift = foh_h / foh_emp if foh_emp > 0 else 7
        boh_avg_shift = boh_h / boh_emp if boh_emp > 0 else 8

        for pos_name in list(foh_positions) + list(boh_positions):
            pool_size = pos_counts.get(pos_name, 0)
            if pool_size == 0:
                continue

            is_foh = pos_name in foh_positions
            cat_pool = foh_total if is_foh else boh_total
            cat_emp = foh_emp if is_foh else boh_emp
            avg_shift = foh_avg_shift if is_foh else boh_avg_shift

            if cat_pool == 0:
                continue

            est_staff = max(1, round(pool_size / cat_pool * cat_emp))
            est_hours = est_staff * avg_shift

            if pos_name not in position_stats:
                position_stats[pos_name] = []
            position_stats[pos_name].append({
                'covers': covers, 'est_staff': est_staff,
                'est_hours': est_hours, 'avg_shift': avg_shift,
            })

    print(f"\n  {'Position':<18} {'Pool':>4} {'AvgStaff':>8} {'AvgShift':>8} {'AllDayCPLH':>10} {'DerivedPeak':>11} {'Industry':>8} {'BLENDED':>8}")
    print(f"  {'-'*86}")

    blended_cplh = {}

    for pos_name in sorted(position_stats.keys()):
        stats = position_stats[pos_name]
        total_covers = sum(s['covers'] for s in stats)

        avg_staff = sum(s['est_staff'] * s['covers'] for s in stats) / total_covers
        avg_shift = sum(s['avg_shift'] * s['covers'] for s in stats) / total_covers

        all_day_cplh_values = [s['covers'] / s['est_hours'] for s in stats if s['est_hours'] > 0]
        if not all_day_cplh_values:
            continue
        all_day_cplh = sum(c * s['covers'] for c, s in zip(all_day_cplh_values, stats)) / total_covers

        # Convert: peak_cplh = all_day_cplh * avg_shift_hours * PEAK_PCT
        derived_peak = all_day_cplh * avg_shift * PEAK_PCT

        industry_peak = INDUSTRY.get(pos_name)

        # Blend: 40% venue-derived / 60% industry (industry-weighted)
        if industry_peak and derived_peak > 0:
            blended = round(derived_peak * 0.40 + industry_peak * 0.60, 1)
        elif derived_peak > 0:
            blended = round(derived_peak, 1)
        else:
            blended = industry_peak

        blended_cplh[pos_name] = blended
        ind_str = str(industry_peak) if industry_peak else 'fixed'
        bl_str = str(blended) if blended else 'fixed'

        print(f"  {pos_name:<18} {pos_counts.get(pos_name,0):>4} {avg_staff:>8.1f} {avg_shift:>7.1f}h {all_day_cplh:>10.2f} {derived_peak:>11.1f} {ind_str:>8} {bl_str:>8}")

    all_venue_cplh[vname] = blended_cplh

    # Impact analysis
    test_covers = 582 if 'LA' in vname else 557
    print(f"\n  --- Scheduling impact for {test_covers} covers ---")
    print(f"  {'Position':<18} {'OldCPLH':>7} {'OldPeak':>7} {'NewCPLH':>7} {'NewPeak':>7} {'Change':>7}")
    print(f"  {'-'*55}")

    for pos_name in sorted(blended_cplh.keys()):
        old_cplh = INDUSTRY.get(pos_name)
        new_cplh = blended_cplh[pos_name]
        if not old_cplh or not new_cplh:
            continue
        old_peak = math.ceil(test_covers * PEAK_PCT / old_cplh)
        new_peak = math.ceil(test_covers * PEAK_PCT / new_cplh)
        diff = new_peak - old_peak
        diff_str = f"+{diff}" if diff > 0 else str(diff)
        print(f"  {pos_name:<18} {old_cplh:>7} {old_peak:>7} {new_cplh:>7.1f} {new_peak:>7} {diff_str:>7}")

# Final recommended values (average across venues)
print(f"\n\n{'='*80}")
print(f"  FINAL RECOMMENDED CPLH VALUES (blended across venues)")
print(f"{'='*80}")
all_positions = set()
for v in all_venue_cplh.values():
    all_positions.update(v.keys())

print(f"\n  {'Position':<18} ", end='')
for vname in all_venue_cplh:
    print(f"{vname:>14}", end='')
print(f"{'  RECOMMENDED':>14}")
print(f"  {'-'*60}")

recommended = {}
for pos_name in sorted(all_positions):
    vals = [all_venue_cplh[v].get(pos_name) for v in all_venue_cplh if all_venue_cplh[v].get(pos_name)]
    if vals:
        avg_val = sum(vals) / len(vals)
        recommended[pos_name] = round(avg_val)
        print(f"  {pos_name:<18} ", end='')
        for vname in all_venue_cplh:
            v = all_venue_cplh[vname].get(pos_name)
            print(f"{v if v else '-':>14}", end='')
        print(f"{recommended[pos_name]:>14}")

print(f"\n  TypeScript for scheduler-lite.ts:")
print(f"  const POS_CPLH = {{")
for p, v in sorted(recommended.items()):
    print(f"    '{p}': {v},")
print(f"  }};")
