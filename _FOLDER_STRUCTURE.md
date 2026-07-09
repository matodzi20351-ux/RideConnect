# How these filenames map to folders

Every "--" in a filename is a folder separator from the original project structure.
Example: `backend--models--User.js` = `backend/models/User.js`

To rebuild the real folder structure, run this in the folder containing these files:

```bash
for f in *--*; do
  target=$(echo "$f" | sed 's/--/\//g')
  mkdir -p "$(dirname "$target")"
  mv "$f" "$target"
done
```

Groups:
- `backend--*`            -> Node.js/Express + MongoDB + Socket.IO API
- `customer-app--*`       -> customer-facing frontend
- `driver-app--*`         -> driver-facing frontend
- `admin-dashboard--*`    -> admin dashboard frontend
- `README.md`             -> top-level project overview
