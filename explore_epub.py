import zipfile
import os

def explore_epub(epub_filepath):
    """
    Opens an EPUB file using zipfile, lists its contents, and attempts to read
    and print the content of each file.

    Args:
        epub_filepath: The path to the EPUB file.
    """
    try:
        with zipfile.ZipFile(epub_filepath, 'r') as epub_file:
            for filename in epub_file.namelist():
                try:
                    with epub_file.open(filename) as file:
                        content = file.read().decode('utf-8', errors='ignore')
                        
                        print(f"Filename: {filename}")
                        
                        if len(content) > 100:
                            print(f"Content (first 100 chars): {content[:100]}")
                        else:
                            print(f"Content: {content}")
                            
                        print("-" * 20)
                        
                except Exception as e:
                    print(f"Error reading '{filename}': {e}")
    except FileNotFoundError:
        print(f"Error: File '{epub_filepath}' not found.")
    except zipfile.BadZipFile:
        print(f"Error: '{epub_filepath}' is not a valid ZIP or EPUB file.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    epub_file = 'file.epub'
    if os.path.exists(epub_file):
        explore_epub(epub_file)
    else:
        print(f"Error: '{epub_file}' does not exist. Please ensure this file is in the same directory or replace with the correct filepath.")