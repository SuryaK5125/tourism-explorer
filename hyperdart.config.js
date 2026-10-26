import pkg from './package.json' with {type:'json'}

export default  {
	// import name from package.json
	name: pkg.name,
	triggers: {
		keywords: [
			'tourist attractions', 'things to do', 'places to visit', 'landmarks', 'sights',
			'points of interest', 'museums', 'temples', 'monuments', 'sightseeing'
		]
		// in the future, we can add other types of triggers
	},
	query_format: {
		regex: [
			// "best tourist attractions in Paris", "things to do near Kyoto", "places to see in NYC"
			'((best|top|famous)\\s+)?(tourist\\s+attractions?|things\\s+to\\s+do|places\\s+to\\s+(visit|see)|landmarks|sights|sightseeing|points\\s+of\\s+interest)\\s+(in|near|around)\\s+HD_LOCATION(__\\w+)?.*',
			// "museums in Delhi", "temples near Kyoto", "historic sites in Rome"
			'((best|top|famous)\\s+)?(museums?|monuments?|temples?|shrines?|forts?|castles?|viewpoints?|parks?|galler(y|ies)|historic(al)?\\s+sites?)\\s+(in|near|around)\\s+HD_LOCATION(__\\w+)?.*',
			// "Paris tourist attractions", "Tokyo sightseeing"
			'HD_LOCATION(__\\w+)?\\s+(tourist\\s+attractions?|sightseeing|landmarks|museums|temples)'
		]
		// in the future, we can add other types of query formats
	},
	server: {
		location: 'dist/backend/index.js',
		configPath: 'dist/backend/wrangler.jsonc',
		schemaPath: 'dist/backend/schema.jsonc'
	},
	client: {
		// location of client side code
		// should point to pkg.umd - but currently that points to dist/index.umd.js
		location: pkg.module,
		// name of the UMD module
		moduleName: pkg.umdName || 'HD' + pkg.name,
		// baseURL is only used in local testing and ignored after publish
		// Optional: defaults to '/name' (the name of the component)
		baseURL: '/' + pkg.name,

	},
	format: {
		mainline: true,
		sidebar: true
		// "sidebar" / "mainline" / "ribbon" / "fullscreen"
	},
	permissions: {
		
	},
	info: {
		// key-values added here will be added to the compInfo section of searchData
	},
	github: "https://github.com/SuryaK5125/tourism-explorer",
	demovideo: "https://youtu.be/6xPopYJye4w"
}
