(function () {
    'use strict';
    document.querySelectorAll('[data-gallery-slider]').forEach(function (slider) {
        var track = slider.querySelector('[data-gallery-track]');
        var slides = Array.from(track.children);
        var controls = slider.querySelector('[data-gallery-controls]');
        var status = slider.querySelector('[data-gallery-position]');
        var current = 0;
        function update() {
            current = Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
            status.textContent = (current + 1) + ' / ' + slides.length;
        }
        function show(index) {
            var next = (index + slides.length) % slides.length;
            track.scrollTo({ left: next * track.clientWidth, behavior: 'instant' });
            update();
        }
        controls.hidden = false;
        slider.querySelector('[data-gallery-prev]').addEventListener('click', function () { show(current - 1); });
        slider.querySelector('[data-gallery-next]').addEventListener('click', function () { show(current + 1); });
        track.addEventListener('keydown', function (event) {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                event.preventDefault();
                show(event.key === 'Home' ? 0 : event.key === 'End' ? slides.length - 1 : current + (event.key === 'ArrowRight' ? 1 : -1));
            }
        });
        track.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
        update();
    });
})();
