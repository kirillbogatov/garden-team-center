'use strict';

module.exports = function registerPhotoRoutes(app, { db, resolveEntity, canUpdate, denied, UPLOADS_DIR, path, fs, crypto }) {
  const ALLOWED_IMAGE_TYPES = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

  function loadEditablePerson(req, res) {
    const person = resolveEntity('people', req.params.id);
    if (!person) {
      res.status(404).json({ error: 'not_found' });
      return null;
    }
    if (!canUpdate('people', person, req.auth.user)) {
      denied(res);
      return null;
    }
    return person;
  }

  function removeStoredPhoto(photoUrl) {
    if (!photoUrl || !photoUrl.startsWith('/uploads/')) return;
    const oldPath = path.join(UPLOADS_DIR, path.basename(photoUrl));
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  app.post('/api/people/:id/photo', (req, res) => {
    const person = loadEditablePerson(req, res);
    if (!person) return;

    const dataUrl = req.body && req.body.photo;
    const match = typeof dataUrl === 'string' && dataUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'invalid_image' });

    const ext = ALLOWED_IMAGE_TYPES[match[1]];
    if (!ext) return res.status(400).json({ error: 'unsupported_type' });

    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > MAX_PHOTO_BYTES) return res.status(413).json({ error: 'too_large' });

    removeStoredPhoto(person.photoUrl);
    const filename = `${person.id}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
    res.json(db.people.update(person.id, { photoUrl: `/uploads/${filename}` }));
  });

  app.delete('/api/people/:id/photo', (req, res) => {
    const person = loadEditablePerson(req, res);
    if (!person) return;

    removeStoredPhoto(person.photoUrl);
    res.json(db.people.update(person.id, { photoUrl: null }));
  });
};
