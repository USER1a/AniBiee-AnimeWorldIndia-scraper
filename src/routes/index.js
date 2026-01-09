const { Router } = require('express');
const { ScraperController, HomeController, TypeController, DetailsController, EpisodesController, EmbedController } = require('../controllers');
const { validateQuery } = require('../middleware');
const { z } = require('zod');

const router = Router();
const scraperController = new ScraperController();
const homeController = new HomeController();
const typeController = new TypeController();
const detailsController = new DetailsController();
const episodesController = new EpisodesController();
const embedController = new EmbedController();

// Home route
router.get('/home', (req, res, next) => homeController.home(req, res, next));

// Details route
router.get('/info/:id', (req, res, next) => detailsController.getDetails(req, res, next));

// Episodes route
router.get('/episodes/:id/:season', (req, res, next) => episodesController.getEpisodes(req, res, next));

// Embed route - supports both formats:
// 1. /embed/:id (episode ID like "one-piece-1x1")
// 2. /embed/:dataId/:season/:episode (like "19932/2/1")
router.get('/embed/:dataId/:season/:episode', (req, res, next) => embedController.getEmbedByDataIdAndEpisode(req, res, next));
router.get('/embed/:id', (req, res, next) => embedController.getEmbed(req, res, next));

// Category route
const pageSchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default('1'),
});

router.get(
  '/category/*',
  validateQuery(pageSchema),
  (req, res, next) => {
    // Extract type from wildcard path (everything after /category/)
    const type = req.params[0] || '';
    req.params.type = type;
    typeController.getType(req, res, next);
  }
);

// Health check route
router.get('/health', (req, res, next) => scraperController.health(req, res, next));

// Scraper routes - GET only
const scrapeSchema = z.object({
  url: z.string().url('Invalid URL format'),
  extractor: z.string().optional(),
});

router.get(
  '/scrape',
  validateQuery(scrapeSchema),
  (req, res, next) => scraperController.scrape(req, res, next)
);

module.exports = router;
