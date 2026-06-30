#!/usr/bin/env python3
"""
Populate english column for merge_field_words and sentence_templates.

For merge_field_words:
  1. Look up definition from tocfl_words (match on word column)
  2. For single-char words not found in tocfl_words, look up from platform.db dict_char_metadata (key='gloss')

For sentence_templates:
  Set english pattern templates based on the Chinese pattern.
"""

import sqlite3
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WC_DB = os.path.join(SCRIPT_DIR, '..', 'writing-challenge.db')
PLATFORM_DB = os.path.join(SCRIPT_DIR, '..', '..', '..', 'platform', 'platform.db')

def main():
    wc = sqlite3.connect(WC_DB)
    pdb = sqlite3.connect(PLATFORM_DB)

    # Add columns if not present
    try:
        wc.execute('ALTER TABLE merge_field_words ADD COLUMN english TEXT DEFAULT ""')
        wc.commit()
        print("Added english column to merge_field_words")
    except:
        print("english column already exists on merge_field_words")

    try:
        wc.execute('ALTER TABLE sentence_templates ADD COLUMN english TEXT DEFAULT ""')
        wc.commit()
        print("Added english column to sentence_templates")
    except:
        print("english column already exists on sentence_templates")

    # --- Populate merge_field_words english ---

    # Build tocfl lookup: word -> definition (take first match)
    tocfl_rows = wc.execute('SELECT word, definition FROM tocfl_words WHERE definition != ""').fetchall()
    tocfl_lookup = {}
    for word, defn in tocfl_rows:
        # tocfl_words may have "word1/word2" forms; index by exact word
        if word not in tocfl_lookup:
            tocfl_lookup[word] = defn
        # Also index the first part before /
        base = word.split('/')[0]
        if base not in tocfl_lookup:
            tocfl_lookup[base] = defn

    # Build platform single-char gloss lookup
    char_gloss_rows = pdb.execute("""
        SELECT c.character, m.value
        FROM dict_chars c
        JOIN dict_char_metadata m ON m.char_id = c.id
        WHERE m.key = 'gloss' AND c.dictionary_id = 1
    """).fetchall()
    char_gloss = {}
    for char, gloss in char_gloss_rows:
        if char not in char_gloss:
            char_gloss[char] = gloss

    # Get all merge_field_words
    words = wc.execute('SELECT id, word, english FROM merge_field_words').fetchall()
    updated = 0
    not_found = []

    for word_id, word, existing_eng in words:
        if existing_eng:  # already populated
            continue

        eng = None

        # Strategy 1: exact match in tocfl_words
        if word in tocfl_lookup:
            eng = tocfl_lookup[word]
        # Strategy 2: try base form (first part before /)
        elif '/' in word and word.split('/')[0] in tocfl_lookup:
            eng = tocfl_lookup[word.split('/')[0]]
        # Strategy 3: single-char lookup from platform
        elif len(word) == 1 and word in char_gloss:
            eng = char_gloss[word]

        if eng:
            # Clean up: take first meaning, trim to reasonable length
            # Take up to first semicolon or the first 80 chars
            clean = eng.split(';')[0].strip()
            if len(clean) > 100:
                clean = clean[:100].rsplit(',', 1)[0]
            wc.execute('UPDATE merge_field_words SET english = ? WHERE id = ?', (clean, word_id))
            updated += 1
        else:
            not_found.append(word)

    wc.commit()
    print(f"Updated {updated} merge_field_words with English translations")
    if not_found:
        print(f"  Not found ({len(not_found)}): {', '.join(not_found[:30])}")
        if len(not_found) > 30:
            print(f"  ... and {len(not_found) - 30} more")

    # --- Populate sentence_templates english ---

    english_patterns = {
        '{person}{action}': '{person} {action}',
        '{person}在{action}': '{person} is {action}',
        '{person}在{location}{action}': '{person} is {action} at {location}',
        '{person}{modal}{action}': '{person} {modal} {action}',
        '{person}{negation}{action}': '{person} {negation} {action}',
        '{person}{action-t}{object}': '{person} {action-t} {object}',
        '{person}在{action-t}{object}': '{person} is {action-t} {object}',
        '{person}{modal}{action-t}{object}': '{person} {modal} {action-t} {object}',
        '{person}{negation}{action-t}{object}': '{person} {negation} {action-t} {object}',
        '{person}有{noun}': '{person} has {noun}',
        '{person}沒有{noun}': "{person} doesn't have {noun}",
        '{person}{degree}{adjective}': '{person} is {degree} {adjective}',
        '{noun-desc}{degree}{adjective}': '{noun-desc} is {degree} {adjective}',
        '{person}覺得{noun-desc}{degree}{adjective}': '{person} thinks {noun-desc} is {degree} {adjective}',
        '{person}在{location}{question}': 'is {person} at {location}{question}',
        '{person}{action}{question}': 'does {person} {action}{question}',
        '{question}{person}{action-t}{object}': '{question} does {person} {action-t} {object}',
        '{person}在做什麼{question}': 'what is {person} doing{question}',
        '{time}{person}{action}': '{time} {person} {action}',
        '{time}{person}在{location}{action}': '{time} {person} is {action} at {location}',
        '{time}{person}{modal}{action-t}{object}': '{time} {person} {modal} {action-t} {object}',
        '{person}{and}{person}{action}': '{person} {and} {person} {action}',
        '{person}{and}{person}{action-t}{object}': '{person} {and} {person} {action-t} {object}',
        '{person}{also}{action}': '{person} {also} {action}',
        '{person}{also}{action-t}{object}': '{person} {also} {action-t} {object}',
        '{person}{action}{direction}{location}': '{person} {action} {direction} {location}',
        '{person}{direction}{location}': '{person} goes {direction} {location}',
        '{person}{action}了{time-span}': '{person} has been {action} for {time-span}',
        '{person}從{location}{action}{direction}{location}': '{person} {action} from {location} {direction} {location}',
        '{time}{person}{and}{person}在{location}{action}': '{time} {person} {and} {person} are {action} at {location}',
        '{person}{action}，{connector}{person}{action}': '{person} {action}, {connector} {person} {action}',
        '{person}{preposition}{location}{action}': '{person} {preposition} {location} {action}',
        '{person}有{counted-thing}': '{person} has {counted-thing}',
        '{person}{modal}{counted-thing}': '{person} {modal} {counted-thing}',
        '{person}{modal}{topic}': '{person} {modal} {topic}',
    }

    templates = wc.execute('SELECT id, pattern, english FROM sentence_templates').fetchall()
    tmpl_updated = 0
    for tmpl_id, pattern, existing_eng in templates:
        if existing_eng:  # already populated
            continue
        eng = english_patterns.get(pattern, '')
        if eng:
            wc.execute('UPDATE sentence_templates SET english = ? WHERE id = ?', (eng, tmpl_id))
            tmpl_updated += 1
        else:
            print(f"  No English pattern for template: {pattern}")

    wc.commit()
    print(f"Updated {tmpl_updated} sentence_templates with English patterns")

    wc.close()
    pdb.close()
    print("Done!")

if __name__ == '__main__':
    main()
