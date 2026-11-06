/** O aparelho desenha 3D (WebGL)? Fica fora do Store3D para não baixar o three.js só para saber. */
export const hasWebGL = () => {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
};
