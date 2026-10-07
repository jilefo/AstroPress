import sqlite3
c = sqlite3.connect(r"d:/Projects/Blogs/AstroPress/local.db")
cur = c.cursor()
active = cur.execute("SELECT option_value FROM wp_options WHERE option_name='astropress_active_theme'").fetchone()
marker = cur.execute("SELECT option_value FROM wp_options WHERE option_name='astropress_slots_synced_theme'").fetchone()
slots = cur.execute("SELECT option_value FROM wp_options WHERE option_name='astropress_template_slots'").fetchone()
print("active =", active[0] if active else None)
print("marker =", marker[0] if marker else None)
print("slots  =", (slots[0][:160] if slots else None))
