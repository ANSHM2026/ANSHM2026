(() => {
  'use strict';

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function initNavigation() {
    const header = document.querySelector('[data-site-header]');
    const nav = document.querySelector('#nav');
    const toggle = document.querySelector('.menu-toggle');
    if (!header || !nav || !toggle) return;

    const close = () => {
      nav.classList.remove('active');
      toggle.setAttribute('aria-expanded', 'false');
    };

    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('active');
      toggle.setAttribute('aria-expanded', String(open));
    });

    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) close();
    });

    document.addEventListener('click', (event) => {
      if (!nav.classList.contains('active')) return;
      if (!header.contains(event.target)) close();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 1120) close();
    }, { passive: true });
  }

  function initSliders() {
    document.querySelectorAll('[data-slider]').forEach((slider) => {
      const slides = Array.from(slider.querySelectorAll('.slides img'));
      if (slides.length < 2) return;

      const dots = Array.from(slider.querySelectorAll('[data-slide-to]'));
      const previous = slider.querySelector('[data-slider-prev]');
      const next = slider.querySelector('[data-slider-next]');
      const delay = Number(slider.dataset.autoplay || 5000);
      let index = Math.max(0, slides.findIndex((slide) => slide.classList.contains('active')));
      let timer = null;

      const render = (target) => {
        index = (target + slides.length) % slides.length;
        slides.forEach((slide, i) => slide.classList.toggle('active', i === index));
        dots.forEach((dot, i) => {
          dot.classList.toggle('active', i === index);
          dot.setAttribute('aria-current', i === index ? 'true' : 'false');
        });
      };

      const stop = () => {
        if (timer) window.clearInterval(timer);
        timer = null;
      };

      const start = () => {
        stop();
        if (delay > 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          timer = window.setInterval(() => render(index + 1), delay);
        }
      };

      previous?.addEventListener('click', () => { render(index - 1); start(); });
      next?.addEventListener('click', () => { render(index + 1); start(); });

      dots.forEach((dot, i) => {
        const activate = () => { render(i); start(); };
        dot.addEventListener('click', activate);
        dot.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activate();
          }
        });
      });

      slider.addEventListener('mouseenter', stop);
      slider.addEventListener('mouseleave', start);
      slider.addEventListener('focusin', stop);
      slider.addEventListener('focusout', start);
      document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());

      render(index);
      start();
    });
  }


  function initSpeakerAffiliations() {
    const lines = Array.from(document.querySelectorAll(
      '.speaker-affiliation-org, .speaker-affiliation-location'
    ));
    if (!lines.length) return;

    const fitLine = (line) => {
      const parent = line.closest('.speaker-affiliation');
      if (!parent) return;

      line.classList.remove('affiliation-wrap-fallback');
      line.style.removeProperty('font-size');

      const parentStyle = window.getComputedStyle(parent);
      const maxSize = parseFloat(parentStyle.fontSize) || 13;
      const minSize = parseFloat(parentStyle.getPropertyValue('--affiliation-min-font-size')) || 10.5;
      const availableWidth = line.clientWidth;
      if (!availableWidth) return;

      line.style.fontSize = `${maxSize}px`;
      if (line.scrollWidth <= availableWidth + 0.5) return;

      let low = Math.min(minSize, maxSize);
      let high = maxSize;

      for (let i = 0; i < 9; i += 1) {
        const size = (low + high) / 2;
        line.style.fontSize = `${size}px`;
        if (line.scrollWidth <= availableWidth + 0.5) low = size;
        else high = size;
      }

      line.style.fontSize = `${Math.max(minSize, Math.floor(low * 10) / 10)}px`;

      // If even the readable minimum cannot fit, wrap as a last-resort safeguard
      // rather than clipping the organisation or location.
      if (line.scrollWidth > line.clientWidth + 0.5) {
        line.style.fontSize = `${minSize}px`;
        line.classList.add('affiliation-wrap-fallback');
      }
    };

    const fitAll = () => lines.forEach(fitLine);
    let resizeFrame = null;
    const requestFit = () => {
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        fitAll();
        window.dispatchEvent(new Event('anshm:layoutchange'));
      });
    };

    requestFit();
    window.addEventListener('resize', requestFit, { passive: true });
    window.addEventListener('load', requestFit, { once: true });

    if (document.fonts?.ready) {
      document.fonts.ready.then(requestFit).catch(() => {});
    }
  }

  function initSpeakerPhotos() {
    document.querySelectorAll('[data-speaker-photo]').forEach((image) => {
      const showFallback = () => {
        image.hidden = true;
      };
      const showPhoto = () => {
        image.hidden = false;
      };

      image.addEventListener('error', showFallback);
      image.addEventListener('load', showPhoto);
      if (image.complete && image.naturalWidth === 0) showFallback();
    });
  }

  function initSpeakerBiographies() {
    const biographies = Array.from(document.querySelectorAll('.speaker-bio'));
    if (!biographies.length) return;

    const hasCollapsedOverflow = (bio, text) => {
      const wasExpanded = bio.classList.contains('expanded');
      if (wasExpanded) bio.classList.remove('expanded');

      const collapsedHeight = text.getBoundingClientRect().height;
      const previousStyle = text.getAttribute('style');

      text.style.display = 'block';
      text.style.overflow = 'visible';
      text.style.webkitLineClamp = 'unset';
      const fullHeight = text.getBoundingClientRect().height;

      if (previousStyle === null) text.removeAttribute('style');
      else text.setAttribute('style', previousStyle);

      const overflowing = fullHeight > collapsedHeight + 1;
      if (wasExpanded && overflowing) bio.classList.add('expanded');
      return overflowing;
    };

    const updateButtons = () => {
      biographies.forEach((bio) => {
        const text = bio.querySelector('.speaker-bio-text');
        const button = bio.querySelector('[data-bio-toggle]');
        if (!text || !button) return;

        const overflowing = hasCollapsedOverflow(bio, text);
        button.hidden = !overflowing;

        if (!overflowing) {
          bio.classList.remove('expanded');
          button.textContent = 'Read more';
          button.setAttribute('aria-expanded', 'false');
        }
      });
    };

    biographies.forEach((bio) => {
      const button = bio.querySelector('[data-bio-toggle]');
      if (!button) return;
      button.addEventListener('click', () => {
        const expanded = bio.classList.toggle('expanded');
        button.textContent = expanded ? 'Show less' : 'Read more';
        button.setAttribute('aria-expanded', String(expanded));
        window.dispatchEvent(new Event('anshm:layoutchange'));
      });
    });

    let resizeFrame = null;
    const requestButtonUpdate = () => {
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        updateButtons();
      });
    };

    updateButtons();
    window.addEventListener('resize', requestButtonUpdate, { passive: true });

    if (document.fonts?.ready) {
      document.fonts.ready.then(requestButtonUpdate).catch(() => {});
    }
  }

  function initSectionRail() {
    const rail = document.querySelector('[data-page-rail]');
    if (!rail) return;

    const shell = rail.querySelector('.page-rail-shell');
    const track = rail.querySelector('.page-rail-track');
    const segmentLayer = rail.querySelector('.page-rail-segments');
    const progress = rail.querySelector('.page-rail-progress');
    const handle = rail.querySelector('.page-rail-handle');
    const dotLayer = rail.querySelector('.page-rail-dots');
    const topButton = rail.querySelector('[data-rail-top]');
    const sections = Array.from(document.querySelectorAll('[data-rail-label]'))
      .filter((element) => element.dataset.railLabel?.trim());

    if (sections.length < 2 || !shell || !track || !segmentLayer || !progress || !handle || !dotLayer) {
      rail.remove();
      return;
    }

    const palette = [
      '#d9b31c',
      '#5b969b',
      '#b77d3d',
      '#788bb2',
      '#8f745f',
      '#6e9786'
    ];

    sections.forEach((section, index) => {
      if (!section.id) section.id = `page-section-${index + 1}`;
    });

    let metrics = [];
    let startY = 0;
    let endY = 1;
    let ticking = false;
    let dragging = false;

    const absoluteTop = (element) => element.getBoundingClientRect().top + window.scrollY;

    const measure = () => {
      const starts = sections.map(absoluteTop);
      startY = starts[0];
      const footer = document.querySelector('.site-footer');
      const documentBottom = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      const contentBottom = footer ? absoluteTop(footer) : documentBottom;
      endY = Math.max(startY + 1, contentBottom);
      const span = Math.max(1, endY - startY);

      metrics = sections.map((section, index) => {
        const start = starts[index];
        const end = index < starts.length - 1 ? starts[index + 1] : endY;
        return {
          section,
          start,
          end,
          color: palette[index % palette.length],
          startRatio: clamp((start - startY) / span, 0, 1),
          endRatio: clamp((end - startY) / span, 0, 1)
        };
      });

      segmentLayer.replaceChildren();
      dotLayer.replaceChildren();

      metrics.forEach((metric, index) => {
        const segment = document.createElement('span');
        segment.className = 'page-rail-segment';
        segment.style.top = `${metric.startRatio * 100}%`;
        segment.style.height = `${Math.max(0.8, (metric.endRatio - metric.startRatio) * 100)}%`;
        segment.style.setProperty('--segment-color', metric.color);
        segment.dataset.index = String(index);
        segmentLayer.appendChild(segment);

        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'page-rail-dot';
        dot.style.top = `${metric.startRatio * 100}%`;
        dot.style.setProperty('--rail-color', metric.color);
        dot.setAttribute('aria-label', `Go to ${metric.section.dataset.railLabel}`);

        const tooltip = document.createElement('span');
        tooltip.className = 'page-rail-tooltip';
        tooltip.textContent = metric.section.dataset.railLabel;
        dot.appendChild(tooltip);

        dot.addEventListener('click', (event) => {
          event.stopPropagation();
          metric.section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        dotLayer.appendChild(dot);
      });

      update();
    };

    const scrollRatio = () => {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const scrollTop = window.scrollY || window.pageYOffset;
      if (maxScroll && scrollTop >= maxScroll - 2) return 1;
      const reference = scrollTop + Math.min(window.innerHeight * .46, 390);
      return clamp((reference - startY) / Math.max(1, endY - startY), 0, 1);
    };

    const activeIndexForRatio = (ratio) => {
      let active = 0;
      metrics.forEach((metric, index) => {
        if (ratio >= metric.startRatio) active = index;
      });
      return active;
    };

    const update = () => {
      if (!metrics.length) return;
      const ratio = scrollRatio();
      const percent = ratio * 100;
      const active = activeIndexForRatio(ratio);
      const activeMetric = metrics[active];

      progress.style.height = `${percent}%`;
      handle.style.top = `${percent}%`;
      track.setAttribute('aria-valuenow', String(Math.round(percent)));
      rail.style.setProperty('--rail-active-color', activeMetric?.color || palette[0]);
      rail.classList.toggle('visible', window.scrollY > 220);

      Array.from(dotLayer.children).forEach((dot, index) => {
        dot.classList.toggle('active', index === active);
      });
      Array.from(segmentLayer.children).forEach((segment, index) => {
        segment.classList.toggle('active', index === active);
      });
      ticking = false;
    };

    const requestUpdate = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    const seek = (clientY) => {
      const rect = track.getBoundingClientRect();
      const ratio = clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1);
      const targetReference = startY + ratio * (endY - startY);
      const targetScroll = targetReference - Math.min(window.innerHeight * .46, 390);
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo({ top: clamp(targetScroll, 0, maxScroll), behavior: 'auto' });
    };

    track.addEventListener('pointerdown', (event) => {
      if (window.innerWidth <= 1120 || event.button !== 0 || event.target.closest('.page-rail-dot')) return;
      dragging = true;
      track.setPointerCapture(event.pointerId);
      seek(event.clientY);
      event.preventDefault();
    });
    track.addEventListener('pointermove', (event) => {
      if (!dragging || window.innerWidth <= 1120) return;
      seek(event.clientY);
      event.preventDefault();
    });
    const stopDragging = (event) => {
      if (!dragging) return;
      dragging = false;
      if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
    };
    track.addEventListener('pointerup', stopDragging);
    track.addEventListener('pointercancel', () => { dragging = false; });

    track.addEventListener('keydown', (event) => {
      if (window.innerWidth <= 1120) return;
      const current = Number(track.getAttribute('aria-valuenow') || 0) / 100;
      let next = current;
      if (event.key === 'ArrowDown') next += .035;
      else if (event.key === 'ArrowUp') next -= .035;
      else if (event.key === 'PageDown') next += .12;
      else if (event.key === 'PageUp') next -= .12;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = 1;
      else return;
      event.preventDefault();
      const rect = track.getBoundingClientRect();
      seek(rect.top + clamp(next, 0, 1) * rect.height);
    });

    if (topButton) {
      topButton.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }

    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', () => { measure(); requestUpdate(); }, { passive: true });
    window.addEventListener('load', measure, { once: true });
    window.addEventListener('anshm:layoutchange', () => setTimeout(measure, 40));

    measure();
  }

  document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initSliders();
    initSpeakerAffiliations();
    initSpeakerPhotos();
    initSpeakerBiographies();
    initSectionRail();
  });
})();
