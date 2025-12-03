import React, { useState, useRef, useEffect } from 'react';
import { 
  DietaryPreference, 
  Ingredient, 
  Recipe, 
  ViewState 
} from './types';
import { detectIngredientsFromImages, suggestRecipes } from './services/geminiService';
import { Button } from './components/Button';
import { LoadingOverlay } from './components/LoadingOverlay';
import { 
  CameraIcon, 
  SparklesIcon, 
  TrashIcon, 
  PlusIcon, 
  ArrowLeftIcon,
  ClockIcon,
  ExclamationIcon,
  XMarkIcon,
  CheckIcon
} from './components/Icons';

export default function App() {
  // State
  const [view, setView] = useState<ViewState>('HOME');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  
  // Ingredients & Recipes
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [dietaryPreference, setDietaryPreference] = useState<DietaryPreference>(DietaryPreference.NONE);
  const [newIngredientText, setNewIngredientText] = useState('');

  // Camera State
  const [capturedImages, setCapturedImages] = useState<string[]>([]); // Base64 strings
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- Handlers ---

  // Handle single file upload (Backup option)
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setLoadingMessage('Analizando imagen...');

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        // Remove data URL prefix
        const base64Data = base64String.split(',')[1];
        
        await processImages([base64Data]);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      alert('Error al procesar la imagen. Inténtalo de nuevo.');
      setLoading(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Shared processing logic
  const processImages = async (images: string[]) => {
    setLoading(true);
    setLoadingMessage('Detectando ingredientes...');
    try {
        const detectedNames = await detectIngredientsFromImages(images);
        
        const newIngredients: Ingredient[] = detectedNames.map((name, idx) => ({
          id: `ing-${Date.now()}-${idx}`,
          name: name.charAt(0).toUpperCase() + name.slice(1),
          isPriority: false
        }));

        setIngredients(prev => [...prev, ...newIngredients]);
        setView('INGREDIENTS');
    } catch (error) {
        alert("Ocurrió un error. Inténtalo de nuevo.");
    } finally {
        setLoading(false);
    }
  };

  // --- Camera Logic ---

  const startCamera = async () => {
    setCapturedImages([]);
    setView('CAMERA');
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      setStream(mediaStream);
    } catch (err) {
      console.error("Error connecting to camera:", err);
      alert("No pudimos acceder a la cámara. Revisa los permisos.");
      setView('HOME');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Ensure video is ready
      if (video.readyState === video.HAVE_ENOUGH_DATA || video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          const base64 = dataUrl.split(',')[1];
          setCapturedImages(prev => [...prev, base64]);
        }
      }
    }
  };

  const finishCameraSession = async () => {
    stopCamera();
    if (capturedImages.length > 0) {
      await processImages(capturedImages);
    } else {
      setView('HOME');
    }
  };

  // Effect to attach stream to video element
  useEffect(() => {
    if (view === 'CAMERA' && stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
    // Cleanup on unmount or view change
    return () => {
      if (view !== 'CAMERA') {
        stopCamera();
      }
    };
  }, [view, stream]);

  // Effect for Keyboard Shortcuts (Enter to capture)
  useEffect(() => {
    if (view !== 'CAMERA') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        capturePhoto();
      }
      if (e.key === 'Escape') {
        stopCamera();
        setView('HOME');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view]); // Dependencies updated to re-bind if view changes (though capturePhoto ref usage is stable)


  // --- Ingredient Logic ---

  const addManualIngredient = () => {
    if (!newIngredientText.trim()) return;
    const newIng: Ingredient = {
      id: `manual-${Date.now()}`,
      name: newIngredientText.trim(),
      isPriority: false
    };
    setIngredients([...ingredients, newIng]);
    setNewIngredientText('');
  };

  const removeIngredient = (id: string) => {
    setIngredients(ingredients.filter(i => i.id !== id));
  };

  const togglePriority = (id: string) => {
    setIngredients(ingredients.map(i => 
      i.id === id ? { ...i, isPriority: !i.isPriority } : i
    ));
  };

  const handleGenerateRecipes = async () => {
    if (ingredients.length === 0) {
      alert("Añade al menos un ingrediente.");
      return;
    }

    setLoading(true);
    setLoadingMessage('Diseñando recetas con tus ingredientes...');

    try {
      const generatedRecipes = await suggestRecipes(ingredients, dietaryPreference);
      setRecipes(generatedRecipes);
      setView('RECIPES');
    } catch (error) {
      alert("Error al generar recetas. Inténtalo más tarde.");
    } finally {
      setLoading(false);
    }
  };

  // --- Views ---

  const renderHome = () => (
    <div className="flex flex-col h-screen bg-gradient-to-br from-brand-50 to-white">
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto w-full">
        <div className="bg-brand-100 p-6 rounded-full mb-8 shadow-inner">
          <span className="text-6xl">🥦</span>
        </div>
        <h1 className="text-4xl font-extrabold text-brand-900 mb-4 tracking-tight">EcoChef</h1>
        <p className="text-gray-600 mb-10 text-lg leading-relaxed">
          Saca una foto a tu nevera o despensa y te diremos qué cocinar para no desperdiciar nada.
        </p>

        <div className="w-full space-y-4">
          <Button 
            fullWidth 
            onClick={startCamera}
            className="h-14 text-lg shadow-xl shadow-brand-500/20"
            icon={<CameraIcon />}
          >
            Escanear Nevera
          </Button>

          <input 
            type="file" 
            accept="image/*" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          
          <Button 
            variant="secondary"
            fullWidth
            onClick={() => fileInputRef.current?.click()} 
            className="h-14"
          >
            Subir desde Galería
          </Button>

          <Button 
            variant="ghost"
            fullWidth
            onClick={() => setView('INGREDIENTS')} 
            className="h-10 text-brand-600"
          >
            Entrada Manual
          </Button>
        </div>

        <div className="mt-12 text-xs text-gray-400">
          Potenciado por Gemini 2.5 AI
        </div>
      </main>
    </div>
  );

  const renderCamera = () => (
    <div className="fixed inset-0 bg-black flex flex-col z-50">
      {/* Hidden Canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Top Controls */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/50 to-transparent">
        <button onClick={() => { stopCamera(); setView('HOME'); }} className="text-white p-2 bg-white/20 rounded-full backdrop-blur-md">
          <XMarkIcon />
        </button>
        <span className="text-white font-medium text-sm px-3 py-1 bg-black/30 rounded-full">
          {capturedImages.length} fotos tomadas
        </span>
      </div>

      {/* Camera Viewport */}
      <div className="flex-1 relative overflow-hidden bg-gray-900 group">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute bottom-4 left-0 right-0 text-center text-white/50 text-sm opacity-0 group-hover:opacity-100 transition-opacity">
          Pulsa Enter para capturar
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="bg-black/80 p-6 pb-8 safe-area-bottom">
        <div className="flex items-center justify-between gap-4">
          
          {/* Thumbnails */}
          <div className="flex-1 overflow-x-auto no-scrollbar flex gap-2 h-16 items-center">
            {capturedImages.map((img, i) => (
              <div key={i} className="relative flex-shrink-0 w-12 h-16 rounded overflow-hidden border border-white/50">
                <img src={`data:image/jpeg;base64,${img}`} className="w-full h-full object-cover" alt="capture" />
              </div>
            ))}
            {capturedImages.length === 0 && (
              <span className="text-gray-500 text-xs text-center w-full">Tus fotos aparecerán aquí</span>
            )}
          </div>

          {/* Capture Trigger */}
          <button 
            onClick={capturePhoto}
            className="w-16 h-16 rounded-full border-4 border-white bg-transparent flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform hover:bg-white/10"
            title="Tomar foto (Enter)"
          >
            <div className="w-12 h-12 rounded-full bg-white"></div>
          </button>

          {/* Done Button */}
          <div className="flex-1 flex justify-end">
            {capturedImages.length > 0 && (
              <button 
                onClick={finishCameraSession}
                className="bg-brand-500 text-white p-3 rounded-full shadow-lg flex items-center gap-2 animate-bounce-short"
              >
                <CheckIcon />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderIngredients = () => (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white px-4 py-4 shadow-sm z-10 sticky top-0">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setView('HOME')} className="p-2 -ml-2 text-gray-600">
            <ArrowLeftIcon />
          </button>
          <h2 className="text-xl font-bold text-gray-800">Tu Despensa</h2>
          <div className="w-8"></div> {/* Spacer */}
        </div>

        {/* Quick Add */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newIngredientText}
            onChange={(e) => setNewIngredientText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addManualIngredient()}
            placeholder="Añadir algo más..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
          />
          <Button onClick={addManualIngredient} variant="secondary" className="px-3">
            <PlusIcon />
          </Button>
        </div>
      </header>

      {/* List */}
      <main className="flex-1 overflow-y-auto p-4 pb-32">
        {ingredients.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p>No hay ingredientes aún.</p>
            <p className="text-sm">Escanea una foto o añade manualmente.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2 flex justify-between items-center">
              <span>Detectados ({ingredients.length})</span>
              <span className="text-xs font-normal normal-case text-brand-600 bg-brand-50 px-2 py-1 rounded">
                Toca el ⚠️ para priorizar
              </span>
            </div>
            {ingredients.map((ing) => (
              <div 
                key={ing.id} 
                className={`flex items-center justify-between p-3 bg-white rounded-xl border transition-colors ${
                  ing.isPriority ? 'border-orange-300 bg-orange-50' : 'border-gray-100 shadow-sm'
                }`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <button 
                    onClick={() => togglePriority(ing.id)}
                    className={`p-2 rounded-full transition-colors ${
                      ing.isPriority ? 'text-orange-500 bg-orange-100' : 'text-gray-300 hover:text-orange-400'
                    }`}
                  >
                    <ExclamationIcon />
                  </button>
                  <span className={`font-medium truncate ${ing.isPriority ? 'text-gray-900' : 'text-gray-700'}`}>
                    {ing.name}
                  </span>
                </div>
                <button 
                  onClick={() => removeIngredient(ing.id)}
                  className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer Actions */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 z-20 pb-8 safe-area-bottom">
        <div className="mb-4">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
              Dieta
            </label>
            <div className="flex gap-2">
              {[DietaryPreference.NONE, DietaryPreference.VEGETARIAN, DietaryPreference.VEGAN].map((pref) => (
                <button
                  key={pref}
                  onClick={() => setDietaryPreference(pref)}
                  className={`flex-1 py-2 text-sm rounded-lg border transition-all ${
                    dietaryPreference === pref 
                      ? 'bg-brand-600 text-white border-brand-600 font-medium shadow-md' 
                      : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {pref === DietaryPreference.NONE ? 'Todo' : pref}
                </button>
              ))}
            </div>
        </div>
        <Button 
          fullWidth 
          onClick={handleGenerateRecipes}
          disabled={ingredients.length === 0}
          icon={<SparklesIcon />}
          className="shadow-xl"
        >
          Sugerir Recetas
        </Button>
      </div>
    </div>
  );

  const renderRecipes = () => (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white px-4 py-4 shadow-sm z-10 sticky top-0">
        <div className="flex items-center justify-between">
          <button onClick={() => setView('INGREDIENTS')} className="p-2 -ml-2 text-gray-600">
            <ArrowLeftIcon />
          </button>
          <h2 className="text-xl font-bold text-gray-800">Sugerencias</h2>
          <div className="w-8"></div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {recipes.map((recipe) => (
          <div 
            key={recipe.id}
            onClick={() => {
              setSelectedRecipe(recipe);
              setView('RECIPE_DETAIL');
            }}
            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 active:scale-95 transition-transform cursor-pointer"
          >
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-bold text-lg text-gray-800 leading-tight">{recipe.title}</h3>
              <div className="flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                <ClockIcon /> {recipe.time}
              </div>
            </div>
            
            <p className="text-gray-600 text-sm mb-4 line-clamp-2">
              {recipe.description}
            </p>

            <div className="flex flex-wrap gap-2 mb-3">
              <span className={`text-xs px-2 py-1 rounded-md font-medium ${
                recipe.missingIngredients.length === 0 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-yellow-100 text-yellow-700'
              }`}>
                {recipe.missingIngredients.length === 0 
                  ? 'Tienes todo ✨' 
                  : `Faltan ${recipe.missingIngredients.length} cosas`}
              </span>
              <span className="text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-600 border border-gray-200">
                {recipe.difficulty}
              </span>
            </div>
          </div>
        ))}
      </main>
    </div>
  );

  const renderRecipeDetail = () => {
    if (!selectedRecipe) return null;

    return (
      <div className="flex flex-col h-screen bg-white">
        <header className="px-4 py-4 border-b sticky top-0 bg-white z-10 flex items-center gap-4">
          <button onClick={() => setView('RECIPES')} className="p-2 -ml-2 text-gray-600 bg-gray-50 rounded-full">
            <ArrowLeftIcon />
          </button>
          <h2 className="text-lg font-bold text-gray-900 truncate flex-1">{selectedRecipe.title}</h2>
        </header>

        <main className="flex-1 overflow-y-auto p-5 pb-10">
          <div className="flex items-center gap-3 mb-6">
            <span className="px-3 py-1 bg-brand-50 text-brand-700 rounded-full text-sm font-semibold">
              {selectedRecipe.time}
            </span>
            <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm">
              {selectedRecipe.difficulty}
            </span>
          </div>

          <p className="text-gray-600 italic mb-8 border-l-4 border-brand-200 pl-4">
            {selectedRecipe.description}
          </p>

          <section className="mb-8">
            <h3 className="font-bold text-gray-900 mb-4 text-lg">Ingredientes</h3>
            
            {/* Missing Ingredients Alert */}
            {selectedRecipe.missingIngredients.length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-4">
                <h4 className="text-red-800 font-semibold text-sm mb-2">Te falta comprar:</h4>
                <ul className="list-disc list-inside text-red-700 text-sm">
                  {selectedRecipe.missingIngredients.map(ing => <li key={ing}>{ing}</li>)}
                </ul>
              </div>
            )}

            <ul className="space-y-2">
              {selectedRecipe.ingredientsUsed.map((ing, idx) => (
                <li key={idx} className="flex items-center gap-3 text-gray-700">
                  <span className="w-2 h-2 rounded-full bg-brand-400"></span>
                  {ing}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="font-bold text-gray-900 mb-4 text-lg">Pasos</h3>
            <div className="space-y-6">
              {selectedRecipe.steps.map((step, idx) => (
                <div key={idx} className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm">
                    {idx + 1}
                  </div>
                  <p className="text-gray-700 leading-relaxed pt-1">
                    {step}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    );
  };

  return (
    <>
      {loading && <LoadingOverlay message={loadingMessage} />}
      
      {view === 'HOME' && renderHome()}
      {view === 'CAMERA' && renderCamera()}
      {view === 'INGREDIENTS' && renderIngredients()}
      {view === 'RECIPES' && renderRecipes()}
      {view === 'RECIPE_DETAIL' && renderRecipeDetail()}
    </>
  );
}