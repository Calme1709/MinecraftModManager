import os
import sys
import json
import zipfile
import subprocess
import requests
import re
from pathlib import Path

try:
    import semver
except ImportError as e:
    print("Semver has not yet been installed. Do: python3 -m pip install semver")
    exit(1)

API_URL = '<api_url>'
FABRIC_VERSION_REGEX = r'fabric-loader-\d+\.\d+\.\d+-.+'
FABRIC_VERSION_REPLACEMENT_REGEX = r'fabric-loader-\d+\.\d+\.\d+-'
STRIP_LEADING_ZEROES_REGEX=r'^0+(\d+)'

def get_versions(directory: str):
    def version_directory_filter(file: str):
        return os.path.isdir(f"{directory}/{file}") and (re.match(FABRIC_VERSION_REGEX, file) or os.path.exists(f"{directory}/{file}/server-{file}.jar"))

    return list(set(map(lambda version: re.sub(FABRIC_VERSION_REPLACEMENT_REGEX, "", version), filter(version_directory_filter, os.listdir(directory)))))

def normalize_names(directory: str):
    [ mods, _ ] = get_installed_mods(directory)

    for mod in mods:
        os.rename(f"{directory}/{mods[mod].get('file')}", f"{directory}/{mod}.jar")

def parse_fabric_manifest_from_jar(path: str) -> dict:
    with zipfile.ZipFile(path, "r") as zip_ref:
        with zip_ref.open("fabric.mod.json") as fabric_manifest:
            return json.loads(fabric_manifest.read())

def get_installed_mods(directory: str) -> dict:
    non_semver_mods = []
    installed = dict()

    for file in os.listdir(directory):
        if file.endswith(".jar"):
            info = parse_fabric_manifest_from_jar(f"{directory}/{file}")

            version = ".".join(map(lambda portion: portion if portion == '0' else re.sub(STRIP_LEADING_ZEROES_REGEX, r'\1', portion), info.get('version').split('.')))
            
            if semver.VersionInfo.isvalid(version):
                installed[info.get("id")] = { "file": file, "version": version }
            else:
                non_semver_mods.append(info.get('id'))

    return [ installed, non_semver_mods ]

install_dir =  f'{Path.home()}/.minecraft/' if sys.platform == "linux" or sys.platform == "linux2" else f"{os.getenv('APPDATA')}/.minecraft/"

if (len(sys.argv) > 1):
    install_dir = sys.argv[1] + '/'

versions_dir = f"{install_dir}versions/"
mods_dir = f"{install_dir}mods/"

if (not os.path.exists(install_dir)):
    print(f"Specified folder {mods_dir} does not exist")
    exit(1)

normalize_names(mods_dir)

versions = get_versions(versions_dir)

if len(versions) == 0:
    print("It doesn't seem like you have fabric installed")
    exit(1)
elif len(versions) == 1:
    version = versions[0]
else:
    print("Which version of Minecraft would you like to install mods for?")

    for i in range(len(versions)):
        print(f" {i + 1} - {versions[i]}")

    selected_version_index = int(input(f"Enter a number (1-{len(versions)}): "))

    if selected_version_index < 1 or selected_version_index > len(versions):
        print(f"Invaid version index: {selected_version_index}")
        exit

    version = versions[selected_version_index - 1]

[ installed_mods, non_semver_mods ] = get_installed_mods(mods_dir)

response = requests.get(f'{API_URL}/latestVersion?mc_version={version}&mods={",".join(list(map(lambda mod: mod, installed_mods)))}').json()

if not response.get('successful'):
    print(f"Server Error {response.get('error')}")
    exit(1)

data = response.get("data")

mods_not_in_repository = data.get("notInRepository")

if len(non_semver_mods) != 0:
    print("Could not update the following mods due to technical limitations, you may need to update them manually: ")

    for mod in non_semver_mods:
        print(f" - {mod}")

if len(mods_not_in_repository) != 0:
    print("Could not update the following mods because they are not in the repository, ask Callum to add them: ")

    for mod in mods_not_in_repository:
        print(f" - {mod}")

up_to_date_versions = data.get("versions")

for mod in up_to_date_versions.keys():
    installed_version = installed_mods.get(mod).get('version')
    up_to_date_version = up_to_date_versions.get(mod).get('version')

    if(semver.compare(installed_version, up_to_date_version) == -1):
        user_input = input(f"{mod} is out of date: {installed_version} vs {up_to_date_version}. Would you like to update? (y/n):")

        if(user_input.lower() != 'y'):
            continue
            
        downloaded = requests.get(up_to_date_versions.get(mod).get('downloadUrl'), allow_redirects=True)

        file = open(f"{mods_dir}/{mod}.jar", "wb")

        file.write(downloaded.content)
