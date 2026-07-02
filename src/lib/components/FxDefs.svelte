<script lang="ts">
  // Hidden SVG filter definitions used by the Pop Art and Thermal effects, via
  // CSS `filter: url(#id)` (preview + grid) and `ctx.filter` (baked capture).
  // Kept in the document once, near the app root, so both references resolve.
</script>

<svg class="fxdefs" aria-hidden="true" focusable="false">
  <defs>
    <!-- Pop Art: pump saturation, then posterize each channel to 5 bands. -->
    <filter id="ps-pop" color-interpolation-filters="sRGB">
      <feColorMatrix type="saturate" values="2.1" />
      <feComponentTransfer>
        <feFuncR type="discrete" tableValues="0 0.30 0.58 0.85 1" />
        <feFuncG type="discrete" tableValues="0 0.30 0.58 0.85 1" />
        <feFuncB type="discrete" tableValues="0 0.30 0.58 0.85 1" />
      </feComponentTransfer>
    </filter>

    <!-- Thermal: collapse to luminance, then map brightness → cold-to-hot colour. -->
    <filter id="ps-thermal" color-interpolation-filters="sRGB">
      <feColorMatrix
        type="matrix"
        values="0.299 0.587 0.114 0 0
                0.299 0.587 0.114 0 0
                0.299 0.587 0.114 0 0
                0     0     0     1 0"
      />
      <feComponentTransfer>
        <feFuncR type="table" tableValues="0 0.10 0.35 0.75 1 1" />
        <feFuncG type="table" tableValues="0 0.15 0.60 0.85 0.70 0.95" />
        <feFuncB type="table" tableValues="0.35 0.75 0.90 0.35 0.10 0.05" />
      </feComponentTransfer>
    </filter>
  </defs>
</svg>

<style>
  .fxdefs {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
    pointer-events: none;
  }
</style>
