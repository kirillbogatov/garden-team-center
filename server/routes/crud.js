'use strict';

const { ApplicationError, createResourceService } = require('../application/resource-service');

// HTTP adapter only. Business workflows and transaction boundaries live in
// application/resource-service.js; this file maps HTTP to that contract.
module.exports = function registerCrudRoutes(app, deps) {
  const { COLLECTIONS } = deps;
  const resources = createResourceService(deps);

  const send = (res, work, successStatus = 200) => {
    try {
      const body = work();
      if (successStatus === 204) return res.status(204).end();
      return res.status(successStatus).json(body);
    } catch (error) {
      if (error instanceof ApplicationError) return res.status(error.status).json({ error: error.code });
      throw error;
    }
  };

  for (const name of COLLECTIONS) {
    app.get(`/api/${name}`, (req, res) => send(res, () => resources.list(name, req.auth.user, req.query)));
    app.get(`/api/${name}/:id`, (req, res) => send(res, () => resources.get(name, req.params.id, req.auth.user)));
    app.post(`/api/${name}`, (req, res) => send(res, () => resources.create(name, req.body, req.auth.user), 201));
    app.put(`/api/${name}/:id`, (req, res) => send(res, () => resources.update(name, req.params.id, req.body, req.auth.user)));
    app.delete(`/api/${name}/:id`, (req, res) => send(res, () => resources.remove(name, req.params.id, req.auth.user), 204));
  }
};
