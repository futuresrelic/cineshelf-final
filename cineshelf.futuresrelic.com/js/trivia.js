// CineShelf Trivia System
// Movie trivia game with multiple modes and difficulty scaling

const TriviaService = (function() {

    // ========================================
    // CONFIGURATION
    // ========================================

    const DIFFICULTY_THRESHOLDS = {
        easy: { min: 1, max: 5 },
        medium: { min: 6, max: 15 },
        hard: { min: 16, max: 999 }
    };

    const BASE_POINTS = {
        easy: 100,
        medium: 200,
        hard: 300
    };

    const SPEED_BONUSES = {
        fast: { threshold: 5, bonus: 50 },      // < 5 seconds
        medium: { threshold: 10, bonus: 30 },    // < 10 seconds
        slow: { threshold: 15, bonus: 10 }       // < 15 seconds
    };

    const STREAK_MULTIPLIERS = {
        3: 1.5,
        5: 2.0,
        10: 3.0
    };

    // ========================================
    // QUESTION TEMPLATES
    // ========================================

    const QUESTION_TEMPLATES = {

        // EASY QUESTIONS (Round 1-5)
        easy: [
            {
                id: 'year_direct',
                type: 'multiple_choice',
                generate: (movies) => {
                    const movie = randomItem(movies);
                    const year = movie.year;
                    const choices = generateYearChoices(year);
                    return {
                        question: `What year was "${movie.title}" released?`,
                        choices: shuffle(choices),
                        correct_answer: year.toString(),
                        metadata: { movie_id: movie.movie_id, movie_title: movie.title }
                    };
                }
            },
            {
                id: 'director_direct',
                type: 'multiple_choice',
                generate: (movies) => {
                    const movie = randomItem(movies.filter(m => m.director));
                    if (!movie) return null;
                    const allDirectors = [...new Set(movies.filter(m => m.director).map(m => m.director))];
                    const choices = [movie.director, ...randomItems(allDirectors.filter(d => d !== movie.director), 3)];
                    return {
                        question: `Who directed "${movie.title}"?`,
                        choices: shuffle(choices),
                        correct_answer: movie.director,
                        metadata: { movie_id: movie.movie_id, movie_title: movie.title }
                    };
                }
            },
            {
                id: 'runtime_direct',
                type: 'multiple_choice',
                generate: (movies) => {
                    const movie = randomItem(movies.filter(m => m.runtime));
                    if (!movie) return null;
                    const runtime = movie.runtime;
                    const choices = [
                        formatRuntime(runtime),
                        formatRuntime(runtime - 15),
                        formatRuntime(runtime + 15),
                        formatRuntime(runtime + 30)
                    ];
                    return {
                        question: `How long is "${movie.title}"?`,
                        choices: shuffle(choices),
                        correct_answer: formatRuntime(runtime),
                        metadata: { movie_id: movie.movie_id, movie_title: movie.title }
                    };
                }
            },
            {
                id: 'certification_direct',
                type: 'multiple_choice',
                generate: (movies) => {
                    const movie = randomItem(movies.filter(m => m.certification));
                    if (!movie) return null;
                    const choices = ['G', 'PG', 'PG-13', 'R'].filter(c => c !== movie.certification);
                    choices.push(movie.certification);
                    return {
                        question: `What is the rating (certification) of "${movie.title}"?`,
                        choices: shuffle(choices.slice(0, 4)),
                        correct_answer: movie.certification,
                        metadata: { movie_id: movie.movie_id, movie_title: movie.title }
                    };
                }
            },
            {
                id: 'genre_direct',
                type: 'multiple_choice',
                generate: (movies) => {
                    const movie = randomItem(movies.filter(m => m.genre));
                    if (!movie) return null;
                    const primaryGenre = movie.genre.split(',')[0].trim();
                    const allGenres = ['Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', 'Romance', 'Thriller', 'Animation'];
                    const choices = [primaryGenre, ...randomItems(allGenres.filter(g => g !== primaryGenre), 3)];
                    return {
                        question: `What genre is "${movie.title}"?`,
                        choices: shuffle(choices),
                        correct_answer: primaryGenre,
                        metadata: { movie_id: movie.movie_id, movie_title: movie.title }
                    };
                }
            }
        ],

        // MEDIUM QUESTIONS (Round 6-15)
        medium: [
            {
                id: 'year_comparison',
                type: 'multiple_choice',
                generate: (movies) => {
                    const [movieA, movieB] = randomItems(movies.filter(m => m.year), 2);
                    if (!movieA || !movieB) return null;
                    const older = movieA.year <= movieB.year ? movieA : movieB;
                    return {
                        question: `Which came out first?`,
                        choices: shuffle([movieA.title, movieB.title]),
                        correct_answer: older.title,
                        metadata: {
                            movie_a: movieA.title,
                            movie_b: movieB.title,
                            year_a: movieA.year,
                            year_b: movieB.year
                        }
                    };
                }
            },
            {
                id: 'runtime_comparison',
                type: 'multiple_choice',
                generate: (movies) => {
                    const [movieA, movieB] = randomItems(movies.filter(m => m.runtime), 2);
                    if (!movieA || !movieB) return null;
                    const longer = movieA.runtime >= movieB.runtime ? movieA : movieB;
                    return {
                        question: `Which movie is longer?`,
                        choices: shuffle([movieA.title, movieB.title]),
                        correct_answer: longer.title,
                        metadata: {
                            movie_a: movieA.title,
                            movie_b: movieB.title,
                            runtime_a: movieA.runtime,
                            runtime_b: movieB.runtime
                        }
                    };
                }
            },
            {
                id: 'rating_comparison',
                type: 'multiple_choice',
                generate: (movies) => {
                    const [movieA, movieB] = randomItems(movies.filter(m => m.rating), 2);
                    if (!movieA || !movieB) return null;
                    const higher = movieA.rating >= movieB.rating ? movieA : movieB;
                    return {
                        question: `Which movie has a higher TMDB rating?`,
                        choices: shuffle([movieA.title, movieB.title]),
                        correct_answer: higher.title,
                        metadata: {
                            movie_a: movieA.title,
                            movie_b: movieB.title,
                            rating_a: movieA.rating,
                            rating_b: movieB.rating
                        }
                    };
                }
            },
            {
                id: 'director_true_false',
                type: 'true_false',
                generate: (movies) => {
                    const movie = randomItem(movies.filter(m => m.director));
                    if (!movie) return null;
                    const isTrue = Math.random() > 0.5;
                    const director = isTrue ? movie.director : randomItem(movies.filter(m => m.director && m.director !== movie.director))?.director;
                    if (!director) return null;
                    return {
                        question: `True or False: "${movie.title}" was directed by ${director}`,
                        choices: ['True', 'False'],
                        correct_answer: isTrue ? 'True' : 'False',
                        metadata: { movie_id: movie.movie_id, movie_title: movie.title, director: director }
                    };
                }
            },
            {
                id: 'year_decade',
                type: 'multiple_choice',
                generate: (movies) => {
                    const movie = randomItem(movies.filter(m => m.year));
                    if (!movie) return null;
                    const decade = Math.floor(movie.year / 10) * 10;
                    const choices = [
                        `${decade}s`,
                        `${decade - 10}s`,
                        `${decade + 10}s`,
                        `${decade - 20}s`
                    ];
                    return {
                        question: `What decade was "${movie.title}" released?`,
                        choices: shuffle(choices),
                        correct_answer: `${decade}s`,
                        metadata: { movie_id: movie.movie_id, movie_title: movie.title, year: movie.year }
                    };
                }
            },
            {
                id: 'collection_check',
                type: 'true_false',
                generate: (movies, allMovies) => {
                    // Sometimes ask about a movie in collection, sometimes not
                    const isInCollection = Math.random() > 0.3; // 70% chance it's in collection
                    let movie;

                    if (isInCollection) {
                        movie = randomItem(movies);
                    } else if (allMovies && allMovies.length > 0) {
                        // Pick from wishlist or other source
                        const notInCollection = allMovies.filter(m =>
                            !movies.find(cm => cm.movie_id === m.movie_id)
                        );
                        if (notInCollection.length > 0) {
                            movie = randomItem(notInCollection);
                        } else {
                            movie = randomItem(movies);
                            // Force it to be in collection if no other option
                            isInCollection = true;
                        }
                    } else {
                        return null;
                    }

                    return {
                        question: `True or False: "${movie.title}" is in your collection`,
                        choices: ['True', 'False'],
                        correct_answer: isInCollection ? 'True' : 'False',
                        metadata: { movie_title: movie.title, in_collection: isInCollection }
                    };
                }
            },
            {
                id: 'actor_connection',
                type: 'multiple_choice',
                generate: async (movies) => {
                    // Find an actor who appeared in multiple movies in the collection
                    const [movieA, movieB] = randomItems(movies.filter(m => m.tmdb_id), 2);
                    if (!movieA || !movieB) return null;

                    try {
                        // Fetch cast for both movies
                        const [castA, castB] = await Promise.all([
                            fetchMovieCast(movieA.tmdb_id),
                            fetchMovieCast(movieB.tmdb_id)
                        ]);

                        if (!castA || !castB || castA.length === 0 || castB.length === 0) return null;

                        // Find common actors
                        const commonActors = castA.filter(actorA =>
                            castB.some(actorB => actorB.id === actorA.id)
                        );

                        if (commonActors.length > 0) {
                            // Question: Which actor connects these movies?
                            const correctActor = randomItem(commonActors);
                            const wrongActors = castA.filter(a => a.id !== correctActor.id).slice(0, 3);
                            const choices = shuffle([correctActor.name, ...wrongActors.map(a => a.name)]);

                            return {
                                question: `Which actor appeared in both "${movieA.title}" and "${movieB.title}"?`,
                                choices: choices,
                                correct_answer: correctActor.name,
                                metadata: {
                                    movie_a: movieA.title,
                                    movie_b: movieB.title,
                                    actor: correctActor.name
                                }
                            };
                        } else {
                            // No common actors - ask if they share an actor
                            return {
                                question: `True or False: "${movieA.title}" and "${movieB.title}" share at least one actor`,
                                choices: ['True', 'False'],
                                correct_answer: 'False',
                                metadata: {
                                    movie_a: movieA.title,
                                    movie_b: movieB.title
                                }
                            };
                        }
                    } catch (error) {
                        console.error('Failed to generate actor connection question:', error);
                        return null;
                    }
                }
            }
        ],

        // HARD QUESTIONS (Round 16+)
        hard: [
            {
                id: 'director_count',
                type: 'multiple_choice',
                generate: (movies) => {
                    const directorCounts = {};
                    movies.filter(m => m.director).forEach(m => {
                        directorCounts[m.director] = (directorCounts[m.director] || 0) + 1;
                    });

                    const topDirectors = Object.entries(directorCounts)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 4)
                        .map(([director]) => director);

                    if (topDirectors.length < 2) return null;

                    return {
                        question: `Which director has the most films in your collection?`,
                        choices: shuffle(topDirectors),
                        correct_answer: topDirectors[0],
                        metadata: { count: directorCounts[topDirectors[0]] }
                    };
                }
            },
            {
                id: 'year_count',
                type: 'multiple_choice',
                generate: (movies) => {
                    const years = movies.filter(m => m.year).map(m => m.year);
                    const year = randomItem(years);
                    const count = years.filter(y => y === year).length;
                    const choices = [count, count + 1, count + 2, Math.max(0, count - 1)];
                    return {
                        question: `How many movies from ${year} are in your collection?`,
                        choices: shuffle(choices.map(String)),
                        correct_answer: count.toString(),
                        metadata: { year: year, count: count }
                    };
                }
            },
            {
                id: 'genre_count',
                type: 'multiple_choice',
                generate: (movies) => {
                    const genreCounts = {};
                    movies.filter(m => m.genre).forEach(m => {
                        m.genre.split(',').forEach(g => {
                            const genre = g.trim();
                            genreCounts[genre] = (genreCounts[genre] || 0) + 1;
                        });
                    });

                    const topGenres = Object.entries(genreCounts)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 4)
                        .map(([genre]) => genre);

                    if (topGenres.length < 2) return null;

                    return {
                        question: `Which genre has the most movies in your collection?`,
                        choices: shuffle(topGenres),
                        correct_answer: topGenres[0],
                        metadata: { count: genreCounts[topGenres[0]] }
                    };
                }
            },
            {
                id: 'oldest_movie',
                type: 'multiple_choice',
                generate: (movies) => {
                    const sorted = [...movies].filter(m => m.year).sort((a, b) => a.year - b.year);
                    if (sorted.length < 4) return null;
                    const oldest = sorted[0];
                    const choices = [oldest, ...randomItems(sorted.slice(1), 3)];
                    return {
                        question: `Which is the oldest movie in your collection?`,
                        choices: shuffle(choices.map(m => m.title)),
                        correct_answer: oldest.title,
                        metadata: { year: oldest.year }
                    };
                }
            },
            {
                id: 'longest_movie',
                type: 'multiple_choice',
                generate: (movies) => {
                    const sorted = [...movies].filter(m => m.runtime).sort((a, b) => b.runtime - a.runtime);
                    if (sorted.length < 4) return null;
                    const longest = sorted[0];
                    const choices = [longest, ...randomItems(sorted.slice(1), 3)];
                    return {
                        question: `Which is the longest movie in your collection?`,
                        choices: shuffle(choices.map(m => m.title)),
                        correct_answer: longest.title,
                        metadata: { runtime: longest.runtime }
                    };
                }
            },
            {
                id: 'not_in_collection',
                type: 'multiple_choice',
                generate: (movies, allMovies) => {
                    if (!allMovies || allMovies.length === 0) return null;

                    const notInCollection = allMovies.filter(m =>
                        !movies.find(cm => cm.movie_id === m.movie_id)
                    );

                    if (notInCollection.length < 1) return null;

                    const outsider = randomItem(notInCollection);
                    const insiders = randomItems(movies, 3);
                    const choices = shuffle([outsider, ...insiders].map(m => m.title));

                    return {
                        question: `Which of these movies is NOT in your collection?`,
                        choices: choices,
                        correct_answer: outsider.title,
                        metadata: { movie_title: outsider.title }
                    };
                }
            },
            {
                id: 'actor_count_connection',
                type: 'multiple_choice',
                generate: async (movies) => {
                    // Advanced: How many actors from Movie A also appeared in Movie B?
                    const [movieA, movieB] = randomItems(movies.filter(m => m.tmdb_id), 2);
                    if (!movieA || !movieB) return null;

                    try {
                        const [castA, castB] = await Promise.all([
                            fetchMovieCast(movieA.tmdb_id),
                            fetchMovieCast(movieB.tmdb_id)
                        ]);

                        if (!castA || !castB) return null;

                        const commonCount = castA.filter(actorA =>
                            castB.some(actorB => actorB.id === actorA.id)
                        ).length;

                        const choices = [commonCount, commonCount + 1, commonCount + 2, Math.max(0, commonCount - 1)]
                            .filter((v, i, a) => a.indexOf(v) === i) // Remove duplicates
                            .sort(() => Math.random() - 0.5)
                            .slice(0, 4);

                        return {
                            question: `How many actors from "${movieA.title}" also appeared in "${movieB.title}"?`,
                            choices: shuffle(choices.map(String)),
                            correct_answer: commonCount.toString(),
                            metadata: {
                                movie_a: movieA.title,
                                movie_b: movieB.title,
                                count: commonCount
                            }
                        };
                    } catch (error) {
                        console.error('Failed to generate actor count question:', error);
                        return null;
                    }
                }
            },
            {
                id: 'multi_movie_actor',
                type: 'multiple_choice',
                generate: async (movies) => {
                    // Find an actor who appeared in 3+ movies in collection
                    const moviesWithTmdb = movies.filter(m => m.tmdb_id);
                    if (moviesWithTmdb.length < 3) return null;

                    try {
                        // Sample 5 random movies and get their casts
                        const sampleMovies = randomItems(moviesWithTmdb, Math.min(5, moviesWithTmdb.length));
                        const castsData = await Promise.all(
                            sampleMovies.map(async m => ({
                                movie: m,
                                cast: await fetchMovieCast(m.tmdb_id)
                            }))
                        );

                        // Count actor appearances
                        const actorMovies = {};
                        castsData.forEach(({ movie, cast }) => {
                            if (!cast) return;
                            cast.forEach(actor => {
                                if (!actorMovies[actor.id]) {
                                    actorMovies[actor.id] = {
                                        name: actor.name,
                                        movies: []
                                    };
                                }
                                actorMovies[actor.id].movies.push(movie.title);
                            });
                        });

                        // Find actors in multiple movies
                        const multiMovieActors = Object.values(actorMovies).filter(a => a.movies.length >= 2);
                        if (multiMovieActors.length === 0) return null;

                        const selectedActor = randomItem(multiMovieActors);
                        const movieList = selectedActor.movies.slice(0, 3).join('", "');

                        // Get other actors from the same movies as wrong answers
                        const allActors = Object.values(actorMovies).map(a => a.name);
                        const wrongActors = allActors.filter(name => name !== selectedActor.name).slice(0, 3);
                        const choices = shuffle([selectedActor.name, ...wrongActors]);

                        return {
                            question: `Which actor appeared in "${movieList}"?`,
                            choices: choices,
                            correct_answer: selectedActor.name,
                            metadata: {
                                actor: selectedActor.name,
                                movies: selectedActor.movies
                            }
                        };
                    } catch (error) {
                        console.error('Failed to generate multi-movie actor question:', error);
                        return null;
                    }
                }
            }
        ]
    };

    // ========================================
    // HELPER FUNCTIONS
    // ========================================

    async function fetchMovieCast(tmdbId) {
        try {
            const response = await fetch('/api/api.php', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    action: 'get_movie_cast',
                    user: localStorage.getItem('cineshelf_user') || 'default',
                    tmdb_id: tmdbId
                })
            });
            const result = await response.json();
            return result.ok ? result.data : null;
        } catch (error) {
            console.error('Failed to fetch movie cast:', error);
            return null;
        }
    }

    function randomItem(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    function randomItems(array, count) {
        const shuffled = [...array].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, Math.min(count, array.length));
    }

    function shuffle(array) {
        return [...array].sort(() => Math.random() - 0.5);
    }

    function generateYearChoices(correctYear) {
        const choices = [correctYear];
        const offsets = [-3, -2, -1, 1, 2, 3];
        const shuffledOffsets = shuffle(offsets);

        for (let i = 0; i < 3 && choices.length < 4; i++) {
            const year = correctYear + shuffledOffsets[i];
            if (year > 1900 && year <= new Date().getFullYear() && !choices.includes(year)) {
                choices.push(year);
            }
        }

        return choices.map(String);
    }

    function formatRuntime(minutes) {
        if (!minutes) return '';
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hours > 0) {
            return `${hours}h ${mins}m`;
        }
        return `${mins}m`;
    }

    function getDifficultyForRound(roundNumber) {
        if (roundNumber <= DIFFICULTY_THRESHOLDS.easy.max) return 'easy';
        if (roundNumber <= DIFFICULTY_THRESHOLDS.medium.max) return 'medium';
        return 'hard';
    }

    function generateQuestionHash(question) {
        // Create a hash to track if we've asked this specific question before
        return btoa(JSON.stringify({
            q: question.question,
            a: question.correct_answer
        }));
    }

    // ========================================
    // QUESTION GENERATION
    // ========================================

    async function generateQuestion(movies, allMovies, roundNumber, usedHashes = new Set()) {
        const difficulty = getDifficultyForRound(roundNumber);
        const templates = QUESTION_TEMPLATES[difficulty];

        // Try to generate a unique question (max 10 attempts)
        for (let attempt = 0; attempt < 10; attempt++) {
            const template = randomItem(templates);
            const question = await template.generate(movies, allMovies);

            if (!question) continue;

            const hash = generateQuestionHash(question);
            if (!usedHashes.has(hash)) {
                return {
                    ...question,
                    difficulty: difficulty,
                    template_id: template.id,
                    round: roundNumber,
                    hash: hash
                };
            }
        }

        // If we couldn't generate unique question, return anyway (fallback)
        const template = randomItem(templates);
        const question = await template.generate(movies, allMovies);
        if (!question) return null;

        return {
            ...question,
            difficulty: difficulty,
            template_id: template.id,
            round: roundNumber,
            hash: generateQuestionHash(question)
        };
    }

    // ========================================
    // SCORING
    // ========================================

    function calculateScore(difficulty, timeInSeconds, currentStreak) {
        let score = BASE_POINTS[difficulty] || 100;

        // Speed bonus
        if (timeInSeconds < SPEED_BONUSES.fast.threshold) {
            score += SPEED_BONUSES.fast.bonus;
        } else if (timeInSeconds < SPEED_BONUSES.medium.threshold) {
            score += SPEED_BONUSES.medium.bonus;
        } else if (timeInSeconds < SPEED_BONUSES.slow.threshold) {
            score += SPEED_BONUSES.slow.bonus;
        }

        // Streak multiplier
        let multiplier = 1;
        if (currentStreak >= 10) {
            multiplier = STREAK_MULTIPLIERS[10];
        } else if (currentStreak >= 5) {
            multiplier = STREAK_MULTIPLIERS[5];
        } else if (currentStreak >= 3) {
            multiplier = STREAK_MULTIPLIERS[3];
        }

        return Math.round(score * multiplier);
    }

    // ========================================
    // PUBLIC API
    // ========================================

    return {
        generateQuestion,
        calculateScore,
        getDifficultyForRound,
        BASE_POINTS,
        SPEED_BONUSES,
        STREAK_MULTIPLIERS
    };

})();
