"""
eRaktKosh Chennai facility registry.

Source of truth for every hospital blood bank that can participate in a
transfer. Each entry carries the eRaktKosh licence/registration code, the
postal address used for courier pickup/drop, the pincode Shiprocket needs for
serviceability, and geographic coordinates used for routing and live tracking.

Coordinates are resolved in this order:
  1. ``latitude``/``longitude`` already stored on the banks table (set by a
     previous geocode run, or edited by an operator).
  2. A live geocode of the facility address via OpenStreetMap Nominatim,
     performed once at seed time when ``GEOCODE_FACILITIES=1``.
  3. The curated fallback coordinates in this file.

Nothing in the transfer pipeline reads a hard-coded hospital name or
coordinate pair — everything resolves through the banks table that this
module seeds.
"""

import os
import time
from typing import Any, Dict, List, Optional

import requests

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
GEOCODE_ENABLED = os.getenv("GEOCODE_FACILITIES", "0") == "1"
GEOCODE_USER_AGENT = os.getenv(
    "GEOCODE_USER_AGENT", "PlateletIQ/2.0 (blood-bank-logistics; contact: ops@plateletiq.dev)"
)

# district "603" is the eRaktKosh district id for Chennai.
CHENNAI_DISTRICT_ID = "603"

CHENNAI_FACILITIES: List[Dict[str, Any]] = [
    {
        "id": "TN-GGH-001",
        "code": "30090",
        "name": "Rajiv Gandhi Govt. General Hospital (Madras Medical College)",
        "short_name": "RGGGH Chennai",
        "tier": "Government Tertiary",
        "address": "Rajiv Gandhi Govt. General Hospital, EVR Periyar Salai, Park Town",
        "pincode": "600003",
        "phone": "04425305000",
        "email": "bloodbank.rgggh@tn.gov.in",
        "latitude": 13.0827,
        "longitude": 80.2755,
    },
    {
        "id": "TN-STA-002",
        "code": "30091",
        "name": "Govt. Stanley Medical College Hospital",
        "short_name": "Stanley Chennai",
        "tier": "Government Tertiary",
        "address": "Govt. Stanley Medical College Hospital, Old Jail Road, Royapuram",
        "pincode": "600001",
        "phone": "04425281351",
        "email": "bloodbank.stanley@tn.gov.in",
        "latitude": 13.1046,
        "longitude": 80.2879,
    },
    {
        "id": "TN-KMH-003",
        "code": "30092",
        "name": "Govt. Kilpauk Medical College Hospital",
        "short_name": "KMC Kilpauk",
        "tier": "Government Tertiary",
        "address": "Govt. Kilpauk Medical College Hospital, Poonamallee High Road, Kilpauk",
        "pincode": "600010",
        "phone": "04426411911",
        "email": "bloodbank.kmc@tn.gov.in",
        "latitude": 13.0797,
        "longitude": 80.2417,
    },
    {
        "id": "TN-OMD-004",
        "code": "33125",
        "name": "Govt. Omandurar Multi Super Speciality Hospital",
        "short_name": "Omandurar Estate",
        "tier": "Government Super-Specialty",
        "address": "TN Govt. Multi Super Speciality Hospital, Walajah Road, Omandurar Estate",
        "pincode": "600002",
        "phone": "04428591313",
        "email": "bloodbank.omandurar@tn.gov.in",
        "latitude": 13.0620,
        "longitude": 80.2790,
    },
    {
        "id": "TN-ICH-005",
        "code": "30094",
        "name": "Institute of Child Health & Hospital for Children",
        "short_name": "ICH Egmore",
        "tier": "Government Paediatric",
        "address": "Institute of Child Health, Halls Road, Egmore",
        "pincode": "600008",
        "phone": "04428190301",
        "email": "bloodbank.ich@tn.gov.in",
        "latitude": 13.0736,
        "longitude": 80.2594,
    },
    {
        "id": "TN-RPT-006",
        "code": "30095",
        "name": "Govt. Royapettah Hospital",
        "short_name": "Royapettah GH",
        "tier": "Government Secondary",
        "address": "Govt. Royapettah Hospital, Westcott Road, Royapettah",
        "pincode": "600014",
        "phone": "04428481313",
        "email": "bloodbank.grh@tn.gov.in",
        "latitude": 13.0540,
        "longitude": 80.2650,
    },
    {
        "id": "TN-APO-014",
        "code": "30099",
        "name": "Apollo Hospitals Greams Road",
        "short_name": "Apollo Greams Road",
        "tier": "Private Tertiary",
        "address": "Apollo Hospitals, 21 Greams Lane, Off Greams Road, Thousand Lights",
        "pincode": "600006",
        "phone": "04428296569",
        "email": "bloodbank@apollohospitals.com",
        "latitude": 13.0635,
        "longitude": 80.2515,
    },
    {
        "id": "TN-APV-015",
        "code": "30281",
        "name": "Apollo Speciality Hospital Vanagaram",
        "short_name": "Apollo Vanagaram",
        "tier": "Private Specialty",
        "address": "Apollo Speciality Hospital, Chennai-Bangalore Highway, Vanagaram",
        "pincode": "600095",
        "phone": "04440405400",
        "email": "bloodbank.vanagaram@apollohospitals.com",
        "latitude": 13.0567,
        "longitude": 80.1585,
    },
    {
        "id": "TN-MIO-006",
        "code": "30173",
        "name": "MIOT International Hospital",
        "short_name": "MIOT Manapakkam",
        "tier": "Private Multi-Specialty",
        "address": "MIOT International, 4/112 Mount Poonamallee Road, Manapakkam",
        "pincode": "600089",
        "phone": "04422492288",
        "email": "bloodbank@miotinternational.com",
        "latitude": 13.0164,
        "longitude": 80.1795,
    },
    {
        "id": "TN-SRM-008",
        "code": "30175",
        "name": "Sri Ramachandra Medical Centre",
        "short_name": "SRMC Porur",
        "tier": "Private Teaching",
        "address": "Sri Ramachandra Medical Centre, 1 Ramachandra Nagar, Porur",
        "pincode": "600116",
        "phone": "04424768027",
        "email": "bloodbank@sriramachandra.edu.in",
        "latitude": 13.0378,
        "longitude": 80.1462,
    },
    {
        "id": "TN-FOR-007",
        "code": "30301",
        "name": "Fortis Malar Hospital Adyar",
        "short_name": "Fortis Malar",
        "tier": "Private Tertiary",
        "address": "Fortis Malar Hospital, 52 First Main Road, Gandhi Nagar, Adyar",
        "pincode": "600020",
        "phone": "04442892222",
        "email": "bloodbank.malar@fortishealthcare.com",
        "latitude": 13.0068,
        "longitude": 80.2570,
    },
    {
        "id": "TN-MGM-005",
        "code": "30269",
        "name": "MGM Healthcare Nelson Manickam Road",
        "short_name": "MGM Healthcare",
        "tier": "Private Specialty",
        "address": "MGM Healthcare, New No. 72 Nelson Manickam Road, Aminjikarai",
        "pincode": "600029",
        "phone": "04445242424",
        "email": "bloodbank@mgmhealthcare.in",
        "latitude": 13.0730,
        "longitude": 80.2260,
    },
    {
        "id": "TN-KAU-009",
        "code": "30288",
        "name": "Kauvery Hospital Alwarpet",
        "short_name": "Kauvery Alwarpet",
        "tier": "Private Multi-Specialty",
        "address": "Kauvery Hospital, 199 Luz Church Road, Mylapore",
        "pincode": "600004",
        "phone": "04440006000",
        "email": "bloodbank.chennai@kauveryhospital.com",
        "latitude": 13.0330,
        "longitude": 80.2540,
    },
    {
        "id": "TN-BIL-010",
        "code": "30302",
        "name": "Billroth Hospitals Shenoy Nagar",
        "short_name": "Billroth Shenoy Nagar",
        "tier": "Private Tertiary",
        "address": "Billroth Hospitals, 43 Lakshmi Talkies Road, Shenoy Nagar",
        "pincode": "600030",
        "phone": "04442294294",
        "email": "bloodbank@billrothhospitals.com",
        "latitude": 13.0800,
        "longitude": 80.2260,
    },
    {
        "id": "TN-GLE-011",
        "code": "30310",
        "name": "Gleneagles Global Health City Perumbakkam",
        "short_name": "Gleneagles Perumbakkam",
        "tier": "Private Quaternary",
        "address": "Gleneagles Global Health City, 439 Cheran Nagar, Perumbakkam",
        "pincode": "600100",
        "phone": "04444777000",
        "email": "bloodbank.chennai@gleneaglesglobalhospitals.com",
        "latitude": 12.9060,
        "longitude": 80.2030,
    },
    {
        "id": "TN-MMM-012",
        "code": "30177",
        "name": "Madras Medical Mission Hospital",
        "short_name": "Madras Medical Mission",
        "tier": "Private Cardiac Specialty",
        "address": "The Madras Medical Mission, 4-A Dr. J. Jayalalithaa Nagar, Mogappair",
        "pincode": "600037",
        "phone": "04426561801",
        "email": "bloodbank@mmm.org.in",
        "latitude": 13.0870,
        "longitude": 80.1800,
    },
    {
        "id": "TN-CIW-013",
        "code": "30185",
        "name": "Cancer Institute (WIA) Adyar",
        "short_name": "Adyar Cancer Institute",
        "tier": "Oncology Specialty",
        "address": "Cancer Institute (WIA), 38 Sardar Patel Road, Adyar",
        "pincode": "600020",
        "phone": "04422350131",
        "email": "bloodbank@cancerinstitutewia.in",
        "latitude": 13.0090,
        "longitude": 80.2540,
    },
    {
        "id": "TN-JEE-016",
        "code": "30210",
        "name": "Jeevan Blood Bank & Research Centre",
        "short_name": "Jeevan Blood Bank",
        "tier": "Standalone Licensed Blood Centre",
        "address": "Jeevan Blood Bank, 6 Rajammal Street, Kilpauk",
        "pincode": "600010",
        "phone": "04426412444",
        "email": "info@jeevan.org",
        "latitude": 13.0817,
        "longitude": 80.2405,
    },
    {
        "id": "TN-VHS-017",
        "code": "30192",
        "name": "Voluntary Health Services Hospital Taramani",
        "short_name": "VHS Taramani",
        "tier": "Non-Profit Multi-Specialty",
        "address": "Voluntary Health Services, Rajiv Gandhi Salai, Taramani",
        "pincode": "600113",
        "phone": "04422541972",
        "email": "bloodbank@vhschennai.org",
        "latitude": 12.9930,
        "longitude": 80.2430,
    },
    {
        "id": "TN-SMF-018",
        "code": "30231",
        "name": "Sundaram Medical Foundation Anna Nagar",
        "short_name": "Sundaram Medical Foundation",
        "tier": "Non-Profit Secondary",
        "address": "Sundaram Medical Foundation, Shanthi Colony, 4th Avenue, Anna Nagar",
        "pincode": "600040",
        "phone": "04443535353",
        "email": "bloodbank@smf.org.in",
        "latitude": 13.0860,
        "longitude": 80.2100,
    },
]

_BY_ID: Dict[str, Dict[str, Any]] = {f["id"]: f for f in CHENNAI_FACILITIES}


def list_facility_seeds() -> List[Dict[str, Any]]:
    """Every facility definition shipped with the build."""
    return list(CHENNAI_FACILITIES)


def get_facility_seed(facility_id: str) -> Optional[Dict[str, Any]]:
    return _BY_ID.get(facility_id)


def geocode_address(address: str, pincode: str) -> Optional[Dict[str, float]]:
    """
    Resolve a street address to coordinates through OpenStreetMap Nominatim.

    Returns None on any failure; callers fall back to the curated coordinates.
    Nominatim's usage policy caps anonymous clients at 1 request/second, so the
    caller is expected to space out calls (see ``seed_facilities``).
    """
    try:
        res = requests.get(
            NOMINATIM_URL,
            params={
                "q": f"{address}, Chennai, Tamil Nadu {pincode}, India",
                "format": "json",
                "limit": 1,
                "countrycodes": "in",
            },
            headers={"User-Agent": GEOCODE_USER_AGENT},
            timeout=6,
        )
        if res.status_code == 200:
            payload = res.json()
            if payload:
                return {"latitude": float(payload[0]["lat"]), "longitude": float(payload[0]["lon"])}
    except Exception as exc:  # network, parse, or rate-limit failure
        print(f"Nominatim geocode notice for '{address}': {exc}")
    return None


def resolve_coordinates(seed: Dict[str, Any]) -> Dict[str, float]:
    """Geocode when enabled, otherwise use the curated coordinates."""
    if GEOCODE_ENABLED:
        located = geocode_address(seed["address"], seed["pincode"])
        time.sleep(1.1)  # honour Nominatim's 1 req/sec policy
        if located:
            return located
    return {"latitude": seed["latitude"], "longitude": seed["longitude"]}
