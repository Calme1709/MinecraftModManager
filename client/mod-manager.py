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
    print('Semver has not yet been installed. Do: python3 -m pip install semver')
    exit(1)

API_URL = '<api_url>'
FABRIC_VERSION_REGEX = r'fabric-loader-\d+\.\d+\.\d+-.+'
FABRIC_VERSION_REPLACEMENT_REGEX = r'fabric-loader-\d+\.\d+\.\d+-'
STRIP_LEADING_ZEROES_REGEX=r'^0+(\d+)'

class API:
    def get_latest_versions(self, mc_version: str, mods: list):
        return self.get(f'latestVersion?mc_version={mc_version}&mods={",".join(mods)}')

    def get(self, path: str):
        response = requests.get(f'{API_URL}/{path}').json()

        if not response.get('successful'):
            raise RuntimeError(f'Server Error: {response.get("error")}')
        else:
            return response.get('data')

class Mod:
    def __init__(self, filename: str):
        self.filename = filename

    def get_version(self):
        return ".".join(map(lambda portion: portion if portion == '0' else re.sub(STRIP_LEADING_ZEROES_REGEX, r'\1', portion), self.parse_fabric_manifest().get('version').split('.')))

    def get_name(self):
        return self.parse_fabric_manifest().get('id')

    def update_file_name_to_mod_name(self):
        directory = '/'.join(self.filename.split('/')[:-1])
        new_name = f'{directory}/{self.get_name()}.jar'

        os.rename(self.filename, new_name)

        self.filename = new_name

    def parse_fabric_manifest(self):
        with zipfile.ZipFile(self.filename, 'r') as zip_ref:
            with zip_ref.open('fabric.mod.json') as fabric_manifest:
                return json.loads(fabric_manifest.read())

class MinecraftInstallation:
    def __init__(self, path: str):
        self.path = path
        self.mod_directory = f'{path}/mods/'
        self.installs_directory = f'{path}/versions/'
    
    def get_installed_minecraft_versions(self):
        def version_directory_filter(file: str):
            return os.path.isdir(f'{self.installs_directory}/{file}') and (re.match(FABRIC_VERSION_REGEX, file) or os.path.exists(f'{self.installs_directory}/{file}/server-{file}.jar'))

        return list(set(map(lambda version: re.sub(FABRIC_VERSION_REPLACEMENT_REGEX, "", version), filter(version_directory_filter, os.listdir(self.installs_directory)))))

    def is_mod_installed(self, mod_name):
        for mod in self.get_installed_mods():
            if mod.get_name() == mod_name:
                return True

        return False

    def get_installed_mods(self):
        mods = list()

        for file in os.listdir(self.mod_directory):
            if file.endswith('.jar'):
                mods.append(Mod(f'{self.mod_directory}/{file}'))

        return mods

    def download_mod(self, url: str, mod_name: str):
        print(f'Downloading {mod_name}...')
        response = requests.get(url, allow_redirects=True)

        with open(f'{self.path}/mods/{mod_name}.jar', 'wb') as file:
            file.write(response.content)

    def delete_mod(self, mod_name: str):
        os.unlink(f'{self.path}/mods/{mod_name}.jar')

class Program:
    def __init__(self):
        install_directory = self.get_working_directory()

        if install_directory is None:
            print('Current directory is not a valid minecraft installation and no installation found at the default path')

        self.api = API()
        self.installation = MinecraftInstallation(install_directory)

        for mod in self.installation.get_installed_mods():
            mod.update_file_name_to_mod_name()

        command = None if len(sys.argv) < 2 else sys.argv[1].lower()

        if command == 'add':
            self.execute_add_command()
        elif command == 'remove':
            self.execute_remove_command()
        elif command == 'update':
            self.execute_update_command()
        elif command == 'list':
            self.execute_list_command()
        else:
            self.execute_help_command()

    def execute_add_command(self):
        mod_name = None if len(sys.argv) < 3 else sys.argv[2].lower()

        if mod_name is None:
            self.print_and_quit('Usage: mod-manager add <mod_name>')

        if self.installation.is_mod_installed(mod_name):
            self.print_and_quit(f'{mod_name} is already installed')

        mc_version = self.get_minecraft_version_to_install_for()

        latest_mod_version_info = self.api.get_latest_versions(mc_version, [ mod_name ])

        mod_entry = latest_mod_version_info.get('versions').get(mod_name)

        if mod_entry is None:
            self.print_and_quit(f'Could not find {mod_name} in the repository')

        self.installation.download_mod(mod_entry.get('downloadUrl'), mod_name)
    
    def execute_remove_command(self):
        mod_name = None if len(sys.argv) < 3 else sys.argv[2].lower()

        if mod_name is None:
            self.print_and_quit('Usage: mod-manager remove <mod_name>')

        if not self.installation.is_mod_installed(mod_name):
            self.print_and_quit(f'{mod_name} is not installed')

        self.installation.delete_mod(mod_name)

    def execute_update_command(self):
        mc_version = self.get_minecraft_version_to_install_for()
        
        installed_mods = self.installation.get_installed_mods()

        updateable_mods = list(filter(lambda mod: semver.VersionInfo.isvalid(mod.get_version()), installed_mods))
        non_semver_mods = [a for a in installed_mods if a not in updateable_mods]

        latest_version_info = self.api.get_latest_versions(mc_version, list(map(lambda mod: mod.get_name(), updateable_mods)))

        mods_not_in_repository = latest_version_info.get("notInRepository")

        if len(non_semver_mods) != 0:
            print("Could not update the following mods due to technical limitations, you may need to update them manually: ")

            for mod in non_semver_mods:
                print(f" - {mod.get_name()}")

        if len(mods_not_in_repository) != 0:
            print("Could not update the following mods because they are not in the repository, ask Callum to add them: ")

            for mod_name in mods_not_in_repository:
                print(f" - {mod_name}")

        updated_versions = latest_version_info.get('versions')

        mods_to_update = list(filter(lambda mod: mod.get_name() in updated_versions and self.do_update_prompt(mod.get_name(), mod.get_version(), updated_versions.get(mod.get_name()).get('version')), updateable_mods))

        for mod in mods_to_update:
            self.installation.download_mod(updated_versions.get(mod.get_name()).get('downloadUrl'), mod.get_name())

    def do_update_prompt(self, mod_name: str, installed_version: str, latest_version: str):
        if semver.compare(installed_version, latest_version) != -1:
            return False

        user_input = input(f'{mod_name} is out of date: {installed_version} vs {latest_version}. Would you like to update? (y/n):')

        return user_input.lower() == 'y'

    def execute_list_command(self):
        for mod in self.installation.get_installed_mods():
            print(f'{mod.get_name()} - {mod.get_version()}')

    def execute_help_command(self):
        print("""
            Mod Manager

            usage: mod-manager <command> <args>

            Commands:d
             - add
                usage: mod-manager add <mod_name>
                
                Installs a mod

             - remove
                usage: mod-manager remove <mod_name>

                Removes a mod

             - update
                usage: mod-manager update
             
                Starts and interactive prompt to update all of the installed mods

             - list
                usage: mod-manager list

                Lists all of the installed mods

             - help
                usage: mod-manager help

                Shows this prompt
        """.replace(' ' * 12, ''))

    def get_minecraft_version_to_install_for(self):
        versions = self.installation.get_installed_minecraft_versions()

        if len(versions) == 0:
            self.print_and_quit("It doesn't seem like you have fabric installed")
        elif len(versions) == 1:
            return versions[0]
        else:
            print("Which version of Minecraft would you like to install mods for?")

            for i in range(len(versions)):
                print(f" {i + 1} - {versions[i]}")

            selected_version_index = int(input(f"Enter a number (1-{len(versions)}): "))

            if selected_version_index < 1 or selected_version_index > len(versions):
                self.print_and_quit(f"Invaid version index: {selected_version_index}")

            return versions[selected_version_index - 1]

    def get_working_directory(self):
        def is_valid_minecraft_install_dir(directory: str):
            return os.path.isdir(directory) and os.path.isdir(f'{directory}/mods')

        possible_directories = [os.getcwd(), f'{Path.home()}/.minecraft/' if sys.platform == 'linux' or sys.platform == 'linux2' else f'{os.getenv("APPDATA")}/.minecraft/']

        for directory in possible_directories:
            if is_valid_minecraft_install_dir(directory):
                return directory

    def print_and_quit(self, message):
        print(message)
        exit(1)

Program()