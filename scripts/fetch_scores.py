import requests, json, datetime, os, sys

FRED_KEY = os.environ["FRED_API_KEY"]

def fred(series):
    r = requests.get(
        "https://api.stlouisfed.org/fred/series/observations",
        params={
            "series_id": series,
            "api_key": FRED_KEY,
            "sort_order": "desc",
            "limit": 10,
            "file_type": "json"
        }
    )
    data = r.json()
    
    # Print full response for debugging
    print(f"FRED response for {series}: {data}")
    
    if "observations" not in data:
        print(f"ERROR: No observations for {series}. Response: {data}")
        sys.exit(1)
    
    obs = data["observations"]
    
    # Filter out "." values (FRED uses "." for missing data)
    valid = [o for o in obs if o["value"] != "."]
    
    if len(valid) < 2:
        print(f"Not enough valid data for {series}, using 0")
        return 0.0, 0.0
    
    return float(valid[0]["value"]), float(valid[1]["value"])

def score_direction(current, previous):
    if current > previous * 1.002: return 1
    if current < previous * 0.998: return -1
    return 0

print("Starting fetch...")
print(f"API Key present: {'yes' if FRED_KEY else 'no'}")

cpi_now, cpi_prev   = fred("CPIAUCSL")
gdp_now, gdp_prev   = fred("GDP")
unemp_now, _        = fred("UNRATE")
fedfunds_now, ff_p  = fred("FEDFUNDS")
y10_now, y10_prev   = fred("DGS10")

print(f"CPI: {cpi_now} vs {cpi_prev}")
print(f"GDP: {gdp_now} vs {gdp_prev}")
print(f"Unemployment: {unemp_now}")
print(f"Fed Funds: {fedfunds_now} vs {ff_p}")
print(f"10Y Yield: {y10_now} vs {y10_prev}")

scores = {
    "timestamp": datetime.datetime.utcnow().isoformat(),
    "USD": {
        "zinsen":       score_direction(fedfunds_now, ff_p),
        "inflation":    score_direction(cpi_now, cpi_prev),
        "arbeitsmarkt": -1 if unemp_now > 4.5 else (1 if unemp_now < 3.8 else 0),
        "wachstum":     score_direction(gdp_now, gdp_prev),
        "cb_ton":       0,
        "yields":       score_direction(y10_now, y10_prev),
        "zinsdiff":     0,
        "risk":         0,
    }
}

scores["USD"]["total"] = sum(v for k, v in scores["USD"].items() if k != "total")

os.makedirs("data", exist_ok=True)
with open("data/scores.json", "w") as f:
    json.dump(scores, f, indent=2)
# Write CSV for Pine Script to read
with open("data/scores.csv", "w") as f:
    f.write("currency,zinsen,inflation,arbeitsmarkt,wachstum,cb_ton,yields,zinsdiff,risk,total\n")
    for ccy, vals in scores.items():
        if isinstance(vals, dict) and "zinsen" in vals:
            f.write(f"{ccy},{vals['zinsen']},{vals['inflation']},{vals['arbeitsmarkt']},"
                    f"{vals['wachstum']},{vals['cb_ton']},{vals['yields']},"
                    f"{vals['zinsdiff']},{vals['risk']},{vals['total']}\n")
print("Done!")
print(json.dumps(scores, indent=2))
