'use strict';

module.exports = function registerPhotoRoutes(app, { db, resolveEntity, canUpdate, denied, UPLOADS_DIR, path, fs, crypto }) {
  const ALLOWED_IMAGE_TYPES = { 'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp', 'image/gif':'gif' };
  app.post('/api/people/:id/photo', (req, res) => {
    const person = resolveEntity('people', req.params.id);
    if (!person) return res.status(404).json({ error: 'not_found' });
    if (!canUpdate('people', person, req.auth.user)) return denied(res);
    const dataUrl = req.body && req.body.photo;
    const match = typeof dataUrl === 'string' && dataUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'invalid_image' });
    const ext = ALLOWED_IMAGE_TYPES[match[1]];
    if (!ext) return res.status(400).json({ error: 'unsupported_type' });
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 8 * 1024 * 1024) return res.status(413).json({ error: 'too_large' });
    if (person.photoUrl && person.photoUrl.startsWith('/uploads/')) {
      const oldPath = path.join(UPLOADS_DIR, path.basename(person.photoUrl));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    const filename = `${person.id}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
    res.json(db.people.update(person.id, { photoUrl: `/uploads/${filename}` }));
  });
  app.delete('/api/people/:id/photo', (req, res) => {
    const person = resolveEntity('people', req.params.id);
    if (!person) return res.status(404).json({ error: 'not_found' });
    if (!canUpdate('people', person, req.auth.user)) return denied(res);
    if (person.photoUrl && person.photoUrl.startsWith('/uploads/')) {
      const oldPath = path.join(UPLOADS_DIR, path.basename(person.photoUrl));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    res.json(db.people.update(person.id, { photoUrl: null }));
  });
};
