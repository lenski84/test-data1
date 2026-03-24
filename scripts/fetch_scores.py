import requests, json, datetime, os, sys

FRED_KEY = os.environ["FRED_API_KEY"]

def fred(series):
    r = requests.get(
        "https://api.stlouisfed.org/fred/series/observations",
        params={
            "series_id": series,
            "api_key": FRED_KEY,
            "sort_order": "desc",
            "limit": 24,
            "file_type": "json"
        }
    )
    data = r.json()
    if "observations" not in data:
        print(f"ERROR for {series}: {data}")
        sys.exit(1)
    valid = [o for o in data["observations"] if o["value"] not in (".", "")]
    if len(valid) < 2:
        print(f"Not enough data for {series}, using 0")
        return 0.0, 0.0
    # For growth rate series where values may be identical, still return them
    return float(valid[0]["value"]), float(valid[1]["value"])

def ecb(dataset, key):
    url = f"https://data-api.ecb.europa.eu/service/data/{dataset}?lastNObservations=2&format=jsondata"
    r = requests.get(url)
    print(f"ECB {key} status: {r.status_code}")
    if r.status_code != 200:
        print(f"ECB {key} failed — using 0")
        return 0.0, 0.0
    data = r.json()
    try:
        series = data["dataSets"][0]["series"]
        first_key = list(series.keys())[0]
        obs = series[first_key]["observations"]
        keys = sorted(obs.keys(), key=lambda x: int(x))
        current  = float(obs[keys[-1]][0])
        previous = float(obs[keys[-2]][0])
        print(f"ECB {key}: {current} / {previous}")
        return current, previous
    except Exception as e:
        print(f"ECB error for {key}: {e} — using 0")
        return 0.0, 0.0

def score_dir(current, previous):
    if previous == 0:
        return 1 if current > 0 else (-1 if current < 0 else 0)
    if current > previous * 1.002: return 1
    if current < previous * 0.998: return -1
    return 0

def unemp_score(rate, low_thresh, high_thresh):
    if rate < low_thresh: return 1
    if rate > high_thresh: return -1
    return 0

print("Fetching data...")

# ── USD (FRED) ────────────────────────────────────────────────────────
cpi_us_n, cpi_us_p = fred("CPIAUCSL")
gdp_us_n, gdp_us_p = fred("GDP")
une_us_n, _        = fred("UNRATE")
ff_n,     ff_p     = fred("FEDFUNDS")

# ── EUR (ECB) ─────────────────────────────────────────────────────────
cpi_eu_n, cpi_eu_p = ecb("ICP/M.U2.N.000000.4.INX", "EUR CPI")
gdp_eu_n, gdp_eu_p = ecb("MNA/Q.Y.I8.W2.S1.S1.B.B1GQ._Z._Z._Z.EUR.LR.GY", "EUR GDP")
# Eurozone unemployment - OECD series via FRED
une_eu_n, _        = fred("LRHUTTTTEZM156S")
# ECB deposit facility rate - most reliable ECB rate series
r_eu_n,   r_eu_p   = fred("ECBDFR")

# ── GBP (FRED) ────────────────────────────────────────────────────────
cpi_gb_n, cpi_gb_p = fred("GBRCPIALLMINMEI")
gdp_gb_n, gdp_gb_p = fred("UKNGDP")
une_gb_n, _        = fred("LRHUTTTTGBM156S")
r_gb_n,   r_gb_p   = fred("BOERUKM")

# ── JPY (FRED) ────────────────────────────────────────────────────────
# Japan CPI - use quarterly OECD series which is more reliable
cpi_jp_n, cpi_jp_p = fred("CPALTT01JPM659N")
gdp_jp_n, gdp_jp_p = fred("JPNRGDPEXP")
une_jp_n, _        = fred("LRHUTTTTJPM156S")
r_jp_n,   r_jp_p   = fred("INTDSRJPM193N")

# ── CHF (FRED) ────────────────────────────────────────────────────────
cpi_ch_n, cpi_ch_p = fred("CHECPIALLMINMEI")
gdp_ch_n, gdp_ch_p = fred("CHEGDPNQDSMEI")
# Switzerland unemployment via OECD
une_ch_n, _        = fred("LRUNTTTTCHA156S")
r_ch_n,   r_ch_p   = fred("IR3TIB01CHM156N")

# ── AUD (FRED) ────────────────────────────────────────────────────────
cpi_au_n, cpi_au_p = fred("AUSCPIALLQINMEI")
gdp_au_n, gdp_au_p = fred("NGDPRSAXDCAUQ")
une_au_n, _        = fred("LRHUTTTTAUM156S")
r_au_n,   r_au_p   = fred("INTDSRAUM193N")

# ── NZD (FRED) ────────────────────────────────────────────────────────
cpi_nz_n, cpi_nz_p = fred("NZLCPIALLQINMEI")
gdp_nz_n, gdp_nz_p = fred("NAEXKP01NZQ657S")
une_nz_n, _        = fred("LRUNTTTTNZQ156S")
r_nz_n,   r_nz_p   = fred("IR3TIB01NZM156N")

print("All data fetched. Calculating scores...")

def build_scores(r_n, r_p, cpi_n, cpi_p, une_n, lo, hi, gdp_n, gdp_p):
    return {
        "zinsen":       score_dir(r_n, r_p),
        "inflation":    score_dir(cpi_n, cpi_p),
        "arbeitsmarkt": unemp_score(une_n, lo, hi),
        "wachstum":     score_dir(gdp_n, gdp_p),
        "cb_ton":       0,
        "yields":       0,
        "zinsdiff":     0,
        "risk":         0,
    }

currencies = {
    "timestamp": datetime.datetime.utcnow().isoformat(),
    "USD": build_scores(ff_n,   ff_p,   cpi_us_n, cpi_us_p, une_us_n, 3.8, 4.5, gdp_us_n, gdp_us_p),
    "EUR": build_scores(r_eu_n, r_eu_p, cpi_eu_n, cpi_eu_p, une_eu_n, 6.0, 7.5, gdp_eu_n, gdp_eu_p),
    "GBP": build_scores(r_gb_n, r_gb_p, cpi_gb_n, cpi_gb_p, une_gb_n, 3.5, 4.5, gdp_gb_n, gdp_gb_p),
    "JPY": build_scores(r_jp_n, r_jp_p, cpi_jp_n, cpi_jp_p, une_jp_n, 2.0, 3.0, gdp_jp_n, gdp_jp_p),
    "CHF": build_scores(r_ch_n, r_ch_p, cpi_ch_n, cpi_ch_p, une_ch_n, 2.0, 3.0, gdp_ch_n, gdp_ch_p),
    "AUD": build_scores(r_au_n, r_au_p, cpi_au_n, cpi_au_p, une_au_n, 3.5, 4.5, gdp_au_n, gdp_au_p),
    "NZD": build_scores(r_nz_n, r_nz_p, cpi_nz_n, cpi_nz_p, une_nz_n, 3.5, 4.5, gdp_nz_n, gdp_nz_p),
}

# Calculate totals
for ccy, vals in currencies.items():
    if isinstance(vals, dict) and "zinsen" in vals:
        vals["total"] = sum(vals.values())

# Print results
for ccy, vals in currencies.items():
    if isinstance(vals, dict):
        print(f"{ccy}: {vals}")

# Write JSON
os.makedirs("data", exist_ok=True)
with open("data/scores.json", "w") as f:
    json.dump(currencies, f, indent=2)
print("scores.json written")

# Write CSV
with open("data/scores.csv", "w") as f:
    f.write("currency,zinsen,inflation,arbeitsmarkt,wachstum,cb_ton,yields,zinsdiff,risk,total\n")
    for ccy in ["USD","EUR","GBP","JPY","CHF","AUD","NZD"]:
        v = currencies[ccy]
        f.write(f"{ccy},{v['zinsen']},{v['inflation']},{v['arbeitsmarkt']},"
                f"{v['wachstum']},{v['cb_ton']},{v['yields']},"
                f"{v['zinsdiff']},{v['risk']},{v['total']}\n")
print("scores.csv written")
import gspread
from google.oauth2.service_account import Credentials
import json as json_lib

creds_json = json_lib.loads(os.environ["GOOGLE_CREDENTIALS"])
creds = Credentials.from_service_account_info(
  creds_json,
  scopes=["https://www.googleapis.com/auth/spreadsheets"]
)
gc = gspread.authorize(creds)
sh = gc.open_by_key(os.environ["SHEET_ID"])
ws = sh.sheet1
ws.clear()
ws.append_row(["currency","zinsen","inflation","arbeitsmarkt",
  "wachstum","cb_ton","yields","zinsdiff","risk","total"])
for ccy in ["USD","EUR","GBP","JPY","CHF","AUD","NZD"]:
  v = currencies[ccy]
  ws.append_row([ccy,v["zinsen"],v["inflation"],
    v["arbeitsmarkt"],v["wachstum"],v["cb_ton"],
    v["yields"],v["zinsdiff"],v["risk"],v["total"]])
print("Google Sheet updated")
print("All done!")
