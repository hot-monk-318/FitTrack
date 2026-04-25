export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'ft-bg':      '#0d0b1e', // deep indigo page background
        'ft-card':    '#16132a', // card / panel background
        'ft-surface': '#1e1a35', // inputs, secondary surfaces
        'ft-border':  '#2a2347', // card borders
        'ft-muted':   '#3d3660', // dividers, deeper hover
      },
    },
  },
  plugins: [],
}
