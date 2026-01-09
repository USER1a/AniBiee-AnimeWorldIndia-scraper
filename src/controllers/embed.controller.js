/**
 * Embed Controller
 * Copyright (c) 2025 Basirul Akhlak Borno - https://basirulakhlak.tech/
 * ⚠️ Educational use only. Respect copyright laws.
 */

const { BaseController } = require('./base.controller');
const { logger } = require('../utils/logger');
const { BadRequestError } = require('../utils/errors');
const { EmbedExtractor } = require('../extractors/embed.extractor');

class EmbedController extends BaseController {
  async getEmbed(req, res, next) {
    await this.execute(req, res, next, async () => {
      try {
        const { id } = req.params;

        if (!id) {
          throw new BadRequestError('ID parameter is required');
        }

        const embedExtractor = new EmbedExtractor();
        // Map episode ID with external API and get embed data
        const embedData = await embedExtractor.getEmbedWithMapping(id);

        res.status(200).json(embedData);
      } catch (error) {
        logger.error('Error extracting embed data', error);
        throw new BadRequestError(`Failed to extract embed data: ${error.message}`);
      }
    });
  }

  async getEmbedByDataIdAndEpisode(req, res, next) {
    await this.execute(req, res, next, async () => {
      try {
        const { dataId, season, episode } = req.params;

        if (!dataId || !season || !episode) {
          throw new BadRequestError('dataId, season, and episode parameters are required');
        }

        const embedExtractor = new EmbedExtractor();
        // Get embed data using data_id, season, and episode
        const embedData = await embedExtractor.getEmbedByDataIdAndEpisode(
          dataId,
          parseInt(season, 10),
          parseInt(episode, 10)
        );

        res.status(200).json(embedData);
      } catch (error) {
        logger.error('Error extracting embed data by data_id and episode', error);
        throw new BadRequestError(`Failed to extract embed data: ${error.message}`);
      }
    });
  }
}

module.exports = { EmbedController };
