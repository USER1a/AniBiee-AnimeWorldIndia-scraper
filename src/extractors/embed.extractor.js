/**
 * Embed Page Extractor
 * Copyright (c) 2025 Basirul Akhlak Borno - https://basirulakhlak.tech/
 * ⚠️ Educational use only. Respect copyright laws.
 */

const { BaseExtractor } = require('./base.extractor');
const { WatchAnimeWorldBase } = require('../base/base');

class EmbedExtractor extends BaseExtractor {
  constructor() {
    super();
    this.base = new WatchAnimeWorldBase();
  }

  getSourceName() {
    return 'watchanimeworld.in';
  }

  async extract(html, url) {
    const $ = this.loadCheerio(html);

    const servers = [];

    // Extract server information from options divs
    $('div[id^="options-"]').each((_, el) => {
      const $option = $(el);
      const optionId = $option.attr('id');
      const optionMatch = optionId.match(/options-(\d+)/);
      
      if (!optionMatch) return;

      const serverNumber = parseInt(optionMatch[1], 10);
      
      // Get iframe src (prefer src, fallback to data-src)
      const iframe = $option.find('iframe').first();
      const iframeSrc = this.extractAttribute(iframe, 'src') || this.extractAttribute(iframe, 'data-src') || '';

      // Get server name from the corresponding tab link
      const serverName = this.extractText($(`a[href="#${optionId}"] .server`).first()).trim();

      if (iframeSrc) {
        servers.push({
          server: serverNumber,
          name: serverName || `Server ${serverNumber}`,
          url: iframeSrc,
        });
      }
    });

    // Sort by server number
    servers.sort((a, b) => a.server - b.server);

    return {
      id: '',
      servers: servers,
    };
  }

  async getSeriesIdFromEpisodeId(episodeId) {
    // Extract series ID from episode ID (e.g., "spy-x-family-3x1" -> "spy-x-family")
    // Remove season/episode pattern like "-3x1", "-2x12", etc.
    const seriesIdMatch = episodeId.match(/^(.+?)(?:-\d+x\d+)$/);
    if (seriesIdMatch) {
      return seriesIdMatch[1];
    }
    return episodeId;
  }

  async parseEpisodeId(episodeId) {
    // Parse episode ID to extract season and episode number
    // Format: anime-name-3x1 (season 3, episode 1)
    const match = episodeId.match(/^(.+?)-(\d+)x(\d+)$/);
    if (match) {
      return {
        animeTitle: match[1],
        season: parseInt(match[2], 10),
        episode: parseInt(match[3], 10),
      };
    }
    return null;
  }

  async searchAnimeInExternalApi(animeTitle) {
    // Search for anime in external API using anime title
    const { httpClient } = require('../utils/http');
    const { logger } = require('../utils/logger');

    try {
      const response = await httpClient.get(`https://anime-api-two-pi.vercel.app/api`, {
        params: {
          q: animeTitle,
        },
      });

      if (response && response.length > 0) {
        // Return the first match
        return response[0];
      }
      return null;
    } catch (error) {
      logger.error(`Error searching anime in external API: ${error.message}`);
      return null;
    }
  }

  async getAnimeIdFromExternalApi(episodeId) {
    // Extract anime title from episode ID and search external API
    const { logger } = require('../utils/logger');

    try {
      const parsed = await this.parseEpisodeId(episodeId);
      if (!parsed) {
        logger.warn(`Could not parse episode ID: ${episodeId}`);
        return null;
      }

      // Search for anime with the parsed title
      const animeData = await this.searchAnimeInExternalApi(parsed.animeTitle);
      if (animeData && animeData.id) {
        return {
          externalApiId: animeData.id, // e.g., "jack-of-all-trades-party-of-none-20333"
          dataId: animeData.data_id || null, // e.g., "20333"
          episodeId: episodeId,
          season: parsed.season,
          episode: parsed.episode,
          originalTitle: animeData.title || parsed.animeTitle,
        };
      }
      return null;
    } catch (error) {
      logger.error(`Error getting anime ID from external API: ${error.message}`);
      return null;
    }
  }

  async getEmbedWithMapping(episodeId) {
    // Map episode ID with external API and get embed servers
    const { logger } = require('../utils/logger');

    try {
      // First, try to map with external API
      const mappedData = await this.getAnimeIdFromExternalApi(episodeId);

      if (!mappedData) {
        logger.info(`Could not map ${episodeId} with external API, falling back to direct extraction`);
        return await this.extractFromUrl(episodeId);
      }

      // If mapping successful, get embed data from local source
      const embedData = await this.extractFromUrl(episodeId);

      // Enhance with external API mapping
      return {
        ...embedData,
        id: episodeId,
        externalApiMapping: {
          animeId: mappedData.externalApiId,
          dataId: mappedData.dataId,
          title: mappedData.originalTitle,
          season: mappedData.season,
          episode: mappedData.episode,
        },
      };
    } catch (error) {
      logger.error(`Error in getEmbedWithMapping: ${error.message}`);
      throw error;
    }
  }

  async extractFromUrl(id) {
    const { httpClient } = require('../utils/http');
    const { getRandomUserAgent } = require('../config/user-agents');
    const { logger } = require('../utils/logger');

    const episodeUrl = `${this.base.baseUrl}/episode/${id}/`;
    
    try {
      // Try episode page first
      const html = await httpClient.get(episodeUrl, {
        headers: {
          'User-Agent': getRandomUserAgent(),
        },
      });

      const data = await this.extract(html, episodeUrl);
      data.id = id;
      return data;
    } catch (error) {
      // If 404 or other error, try details page
      const is404 = error.response?.status === 404 || 
                    error.status === 404 || 
                    error.message?.includes('404') ||
                    error.code === 'ENOTFOUND';
      
      if (is404) {
        logger.info(`Episode page not found (404), trying details page for: ${id}`);
        
        const seriesId = await this.getSeriesIdFromEpisodeId(id);
        
        // Try series first, then movies
        const detailUrls = [
          `${this.base.baseUrl}/series/${seriesId}/`,
          `${this.base.baseUrl}/movies/${seriesId}/`,
        ];

        let lastDetailError;
        for (const detailUrl of detailUrls) {
          try {
            const detailHtml = await httpClient.get(detailUrl, {
              headers: {
                'User-Agent': getRandomUserAgent(),
              },
            });

            const data = await this.extract(detailHtml, detailUrl);
            data.id = id;
            return data;
          } catch (detailError) {
            lastDetailError = detailError;
            // Continue to next URL
            continue;
          }
        }
        
        // If all detail URLs failed, throw the last error
        if (lastDetailError) {
          throw lastDetailError;
        }
      }
      
      // Re-throw original error if not 404
      throw error;
    }
  }

  async getEmbedByDataId(dataId, season) {
    // Get embed data using data_id and season from external API
    const { httpClient } = require('../utils/http');
    const { getRandomUserAgent } = require('../config/user-agents');
    const { logger } = require('../utils/logger');

    try {
      // Construct episode ID from data_id and season
      // This will be used to find the episode page
      // Format: construct a URL that can fetch the embed
      const episodeUrl = `${this.base.baseUrl}/episode/?data_id=${dataId}&season=${season}`;
      
      try {
        const html = await httpClient.get(episodeUrl, {
          headers: {
            'User-Agent': getRandomUserAgent(),
          },
        });

        const data = await this.extract(html, episodeUrl);
        data.id = `${dataId}-season-${season}`;
        data.externalApiMapping = {
          dataId: dataId,
          season: season,
        };
        return data;
      } catch (error) {
        // If direct URL fails, try searching by data_id
        logger.info(`Could not fetch using data_id URL, trying search: ${dataId}`);
        
        // Try to search externally and map
        const response = await httpClient.get(`https://anime-api-two-pi.vercel.app/api`, {
          params: {
            id: dataId,
          },
        });

        if (response && response.length > 0) {
          const animeData = response[0];
          const title = animeData.title || '';
          
          // Get series ID from title
          const seriesId = title.toLowerCase().replace(/\s+/g, '-');
          const detailUrls = [
            `${this.base.baseUrl}/series/${seriesId}/`,
            `${this.base.baseUrl}/movies/${seriesId}/`,
          ];

          let lastDetailError;
          for (const detailUrl of detailUrls) {
            try {
              const detailHtml = await httpClient.get(detailUrl, {
                headers: {
                  'User-Agent': getRandomUserAgent(),
                },
              });

              const data = await this.extract(detailHtml, detailUrl);
              data.id = `${dataId}-season-${season}`;
              data.externalApiMapping = {
                dataId: dataId,
                season: season,
                title: animeData.title,
              };
              return data;
            } catch (detailError) {
              lastDetailError = detailError;
              continue;
            }
          }

          if (lastDetailError) {
            throw lastDetailError;
          }
        }

        throw error;
      }
    } catch (error) {
      logger.error(`Error getting embed by data_id: ${error.message}`);
      throw error;
    }
  }

  async getEmbedByDataIdAndEpisode(dataId, season, episode) {
    // Get embed data using data_id, season, and episode
    const { httpClient } = require('../utils/http');
    const { getRandomUserAgent } = require('../config/user-agents');
    const { logger } = require('../utils/logger');

    try {
      logger.info(`Searching for data_id: ${dataId}, season: ${season}, episode: ${episode}`);
      
      // Instead of fetching ALL anime, construct common anime title patterns
      // and try to match them directly to the watchanimeworld URL pattern
      
      // Common pattern for converting anime titles
      const constructCommonSeriesIds = (dataId) => {
        // Generate common series ID patterns based on popular anime
        const patterns = [
          'one-punch-man',
          'one-piece',
          'naruto',
          'bleach',
          'demon-slayer',
          'jujutsu-kaisen',
          'attack-on-titan',
          'my-hero-academia',
          'dragon-ball-super',
          'spy-x-family',
          'fire-force',
          'chainsaw-man',
          'hunter-x-hunter',
          'solo-leveling',
        ];
        return patterns;
      };

      // Try to fetch anime info from external API with timeout
      let animeTitle = null;
      
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('API timeout')), 5000)
        );
        
        const apiPromise = httpClient.get(`https://anime-api-two-pi.vercel.app/api`);
        const response = await Promise.race([apiPromise, timeoutPromise]);
        
        if (Array.isArray(response)) {
          const anime = response.find(item => String(item.data_id) === String(dataId));
          if (anime && anime.title) {
            animeTitle = anime.title;
            logger.info(`Found anime from API: ${animeTitle}`);
          }
        }
      } catch (apiError) {
        logger.warn(`Could not fetch from external API: ${apiError.message}`);
      }

      if (!animeTitle) {
        logger.warn(`No title found for data_id: ${dataId}, using fallback patterns`);
        // If we can't get from API, we'll use common patterns and try them
      }

      // Try to construct and fetch episode
      const seriesPatterns = animeTitle 
        ? [animeTitle.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')]
        : constructCommonSeriesIds(dataId);
      
      const constructedEpisodeId = `${seriesPatterns[0]}-${season}x${episode}`;
      logger.info(`Trying constructed ID: ${constructedEpisodeId}`);
      
      const episodeUrl = `${this.base.baseUrl}/episode/${constructedEpisodeId}/`;
      
      try {
        logger.info(`Fetching episode from: ${episodeUrl}`);
        const html = await httpClient.get(episodeUrl, {
          headers: {
            'User-Agent': getRandomUserAgent(),
          },
        });

        const data = await this.extract(html, episodeUrl);
        data.id = `${dataId}/${season}/${episode}`;
        data.externalApiMapping = {
          dataId: dataId,
          season: season,
          episode: episode,
          title: animeTitle || 'Unknown',
          constructedId: constructedEpisodeId,
        };
        return data;
      } catch (episodeError) {
        logger.info(`Episode page not found for ${constructedEpisodeId}, trying series page`);
        
        // Fallback to series page
        for (const seriesId of seriesPatterns) {
          const detailUrls = [
            `${this.base.baseUrl}/series/${seriesId}/`,
            `${this.base.baseUrl}/movies/${seriesId}/`,
          ];

          for (const detailUrl of detailUrls) {
            try {
              logger.info(`Trying detail URL: ${detailUrl}`);
              const detailHtml = await httpClient.get(detailUrl, {
                headers: {
                  'User-Agent': getRandomUserAgent(),
                },
              });

              const data = await this.extract(detailHtml, detailUrl);
              data.id = `${dataId}/${season}/${episode}`;
              data.externalApiMapping = {
                dataId: dataId,
                season: season,
                episode: episode,
                title: animeTitle || 'Unknown',
                constructedId: constructedEpisodeId,
              };
              return data;
            } catch (detailError) {
              logger.debug(`Detail URL failed: ${detailUrl}`);
              continue;
            }
          }
        }

        throw new Error(`Could not find any page for data_id: ${dataId}`);
      }
    } catch (error) {
      logger.error(`Error getting embed by data_id and episode: ${error.message}`);
      throw error;
    }
  }
}

module.exports = { EmbedExtractor };
